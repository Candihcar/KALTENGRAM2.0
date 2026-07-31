import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerPusher } from '@/lib/pusher'

export async function POST(request: Request, { params }: { params: { chatId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId: params.chatId, userId: session.user.id } },
  })
  if (!member) {
    return NextResponse.json({ error: 'Вы не в чате' }, { status: 403 })
  }

  const now = new Date()
  const updated = await prisma.message.updateMany({
    where: {
      chatId: params.chatId,
      senderId: { not: session.user.id },
      readAt: null,
    },
    data: { readAt: now },
  })

  if (updated.count > 0) {
    const marked = await prisma.message.findMany({
      where: { chatId: params.chatId, readAt: now },
      select: { id: true },
    })
    await triggerPusher(`chat-${params.chatId}`, 'messages-read', {
      ids: marked.map((m) => m.id),
      readAt: now.toISOString(),
    })
  }

  return NextResponse.json({ ok: true })
}
