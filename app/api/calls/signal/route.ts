import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { triggerPusher } from '@/lib/pusher'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  try {
    const { callId, data } = await request.json()

    const call = await prisma.call.findUnique({ where: { id: callId } })
    if (!call) {
      return NextResponse.json({ error: 'Звонок не найден' }, { status: 404 })
    }
    if (call.callerId !== session.user.id && call.receiverId !== session.user.id) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    await triggerPusher(`call-${callId}`, 'call-signal', {
      ...data,
      from: session.user.id,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}
