import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceRateLimit } from '@/lib/rate-limit'
import PusherServer from 'pusher'

function getPusher(): PusherServer | null {
  const appId = process.env.PUSHER_APP_ID
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const secret = process.env.PUSHER_SECRET
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!appId || !key || !secret || !cluster) return null
  return new PusherServer({ appId, key, secret, cluster, useTLS: true })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const rateLimited = enforceRateLimit(request, 120, 60_000, 'pusher-auth', session.user.id)
  if (rateLimited) return rateLimited

  const pusher = getPusher()
  if (!pusher) {
    return NextResponse.json({ error: 'Pusher не настроен' }, { status: 500 })
  }

  const body = await request.text()
  const params = new URLSearchParams(body)
  const socketId = params.get('socket_id')
  const channelName = params.get('channel_name')
  if (!socketId || !channelName) {
    return NextResponse.json({ error: 'Неверные параметры' }, { status: 400 })
  }

  const userId = session.user.id

  let m = channelName.match(/^private-user-(.+)$/)
  if (m) {
    if (m[1] !== userId) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
    return NextResponse.json(pusher.authorizeChannel(socketId, channelName))
  }

  m = channelName.match(/^private-chat-(.+)$/)
  if (m) {
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId: m[1], userId } },
    })
    if (!member) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
    return NextResponse.json(pusher.authorizeChannel(socketId, channelName))
  }

  m = channelName.match(/^private-call-(.+)$/)
  if (m) {
    const call = await prisma.call.findUnique({ where: { id: m[1] } })
    if (!call || (call.callerId !== userId && call.receiverId !== userId)) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }
    return NextResponse.json(pusher.authorizeChannel(socketId, channelName))
  }

  m = channelName.match(/^presence-(.+)$/)
  if (m) {
    const targetId = m[1]
    if (targetId !== userId) {
      const mySpaces = await prisma.spaceMember.findMany({
        where: { userId },
        select: { spaceId: true },
      })
      const shared = await prisma.spaceMember.findFirst({
        where: { userId: targetId, spaceId: { in: mySpaces.map((s) => s.spaceId) } },
      })
      if (!shared) {
        return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
      }
    }
    const auth = pusher.authorizeChannel(socketId, channelName, {
      user_id: userId,
      user_info: { name: session.user.name || session.user.email || 'User' },
    })
    return NextResponse.json(auth)
  }

  return NextResponse.json({ error: 'Недопустимый канал' }, { status: 403 })
}
