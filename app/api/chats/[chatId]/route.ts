import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request, { params }: { params: { chatId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const chat = await prisma.chat.findFirst({
    where: { id: params.chatId, members: { some: { userId: session.user.id } } },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true, image: true, online: true, lastSeen: true, bio: true },
          },
        },
      },
    },
  })

  if (!chat) {
    return NextResponse.json({ error: 'Чат не найден' }, { status: 404 })
  }

  return NextResponse.json(chat)
}
