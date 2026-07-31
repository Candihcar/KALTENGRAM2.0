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
    const { online } = await request.json()

    await prisma.user.updateMany({
      where: {
        online: true,
        lastSeen: { lt: new Date(Date.now() - 90_000) },
      },
      data: { online: false },
    })

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { online: !!online, lastSeen: new Date() },
      select: { id: true, online: true, lastSeen: true },
    })

    await triggerPusher(`presence-${user.id}`, 'presence-updated', user)

    return NextResponse.json(user)
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}
