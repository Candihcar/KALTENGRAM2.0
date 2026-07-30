import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request, { params }: { params: { chatId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)

  const messages = await prisma.message.findMany({
    where: { chatId: params.chatId },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: { id: true, username: true, displayName: true, image: true } },
      replyTo: { include: { sender: { select: { id: true, displayName: true } } } },
    },
  })

  return NextResponse.json({
    messages: messages.reverse(),
    nextCursor: messages.length === limit ? messages[0]?.id : null,
  })
}

export async function POST(request: Request, { params }: { params: { chatId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  try {
    const { content, type, fileUrl, replyToId } = await request.json()

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: params.chatId, userId: session.user.id } },
    })
    if (!member) {
      return NextResponse.json({ error: 'Вы не в чате' }, { status: 403 })
    }

    const message = await prisma.message.create({
      data: {
        chatId: params.chatId,
        senderId: session.user.id,
        content,
        type: type || 'TEXT',
        fileUrl,
        replyToId,
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, image: true } },
        replyTo: { include: { sender: { select: { id: true, displayName: true } } } },
      },
    })

    await prisma.chat.update({
      where: { id: params.chatId },
      data: { updatedAt: new Date() },
    })

    try {
      const Pusher = require('pusher')
      const pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.NEXT_PUBLIC_PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
        useTLS: true,
      })
      await pusher.trigger(`chat-${params.chatId}`, 'new-message', message)
    } catch {}

    return NextResponse.json(message, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}
