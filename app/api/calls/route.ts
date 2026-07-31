import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerPusher } from '@/lib/pusher'
import { enforceRateLimit } from '@/lib/rate-limit'

function sanitizeCall(call: any) {
  return {
    ...call,
    caller: call.caller ? { ...call.caller, image: null } : null,
    receiver: call.receiver ? { ...call.receiver, image: null } : null,
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const rateLimited = enforceRateLimit(request, 10, 60_000, 'call', session.user.id)
  if (rateLimited) return rateLimited

  try {
    const { receiverId } = await request.json()

    let chat = await prisma.chat.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId: session.user.id } } },
          { members: { some: { userId: receiverId } } },
        ],
      },
    })

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          type: 'DIRECT',
          members: {
            create: [
              { userId: session.user.id, role: 'MEMBER' },
              { userId: receiverId, role: 'MEMBER' },
            ],
          },
        },
      })
    }

    const call = await prisma.call.create({
      data: {
        chatId: chat.id,
        callerId: session.user.id,
        receiverId,
        status: 'RINGING',
      },
      include: {
        caller: { select: { id: true, displayName: true, image: true } },
        receiver: { select: { id: true, displayName: true, image: true } },
      },
    })

    await triggerPusher(`user-${receiverId}`, 'incoming-call', sanitizeCall(call))

    return NextResponse.json(call, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Ошибка звонка' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  try {
    const { callId, status } = await request.json()

    const existing = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        caller: { select: { id: true, displayName: true, image: true } },
        receiver: { select: { id: true, displayName: true, image: true } },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Звонок не найден' }, { status: 404 })
    }

    const call = await prisma.call.update({
      where: { id: callId },
      data: {
        status,
        ...(status === 'ONGOING' ? { startedAt: new Date() } : {}),
        ...(status === 'ENDED' || status === 'DECLINED' || status === 'MISSED'
          ? { endedAt: new Date() }
          : {}),
      },
      include: {
        caller: { select: { id: true, displayName: true, image: true } },
        receiver: { select: { id: true, displayName: true, image: true } },
      },
    })

    await triggerPusher(`call-${callId}`, 'call-updated', { call: sanitizeCall(call) })

    if (status === 'ENDED' && existing.status === 'RINGING') {
      await triggerPusher(`user-${existing.receiverId}`, 'call-cancelled', { callId })
    }

    return NextResponse.json(call)
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}
