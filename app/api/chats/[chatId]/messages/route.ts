import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerPusher } from '@/lib/pusher'
import { enforceRateLimit } from '@/lib/rate-limit'

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
      attachments: true,
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

  const rateLimited = enforceRateLimit(request, 30, 60_000, 'message', session.user.id)
  if (rateLimited) return rateLimited

  try {
    const { content, type, fileUrl, replyToId, attachments } = await request.json()

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
        fileUrl: fileUrl || (attachments?.[0] as string) || null,
        replyToId,
        ...(attachments?.length
          ? {
              attachments: {
                create: (attachments as string[]).map((url: string) => ({
                  type: 'IMAGE',
                  url,
                })),
              },
            }
          : {}),
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, image: true } },
        replyTo: { include: { sender: { select: { id: true, displayName: true } } } },
        attachments: true,
      },
    })

    await prisma.chat.update({
      where: { id: params.chatId },
      data: { updatedAt: new Date() },
    })

    try {
      await triggerPusher(`chat-${params.chatId}`, 'new-message', { id: message.id })

      const members = await prisma.chatMember.findMany({
        where: { chatId: params.chatId },
        select: { userId: true },
      })
      await Promise.all(
        members.map((m) =>
          triggerPusher(`user-${m.userId}`, 'chat-updated', {
            chatId: params.chatId,
          })
        )
      )
    } catch {}

    return NextResponse.json(message, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}
