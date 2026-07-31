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

    const stale = await prisma.user.findMany({
      where: { online: true, lastSeen: { lt: new Date(Date.now() - 90_000) } },
      select: { id: true, lastSeen: true },
    })
    if (stale.length) {
      await prisma.user.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { online: false },
      })
      await Promise.all(
        stale.map((s) =>
          triggerPusher(`presence-${s.id}`, 'presence-updated', {
            id: s.id,
            online: false,
            lastSeen: s.lastSeen.toISOString(),
          })
        )
      )
    }

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
