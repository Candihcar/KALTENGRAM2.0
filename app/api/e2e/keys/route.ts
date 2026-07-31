import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceRateLimit } from '@/lib/rate-limit'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const url = new URL(request.url)
  const userIds = url.searchParams.get('userIds')

  if (userIds) {
    const ids = userIds.split(',').filter(Boolean).slice(0, 100)
    if (!ids.length) return NextResponse.json({})
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, e2ePub: { not: null } },
      select: { id: true, e2ePub: true },
    })
    const map: Record<string, string> = {}
    for (const u of users) if (u.e2ePub) map[u.id] = u.e2ePub
    return NextResponse.json(map)
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { e2ePub: true, e2ePrivEnc: true, e2eSalt: true },
  })

  return NextResponse.json({
    pub: me?.e2ePub || null,
    salt: me?.e2eSalt || null,
    privEnc: me?.e2ePrivEnc || null,
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const rateLimited = enforceRateLimit(request, 20, 60_000, 'e2e', session.user.id)
  if (rateLimited) return rateLimited

  try {
    const { pub, salt, privEnc } = await request.json()
    if (!pub || !salt || !privEnc) {
      return NextResponse.json({ error: 'Неполные данные ключей' }, { status: 400 })
    }
    if (typeof pub !== 'string' || typeof salt !== 'string' || typeof privEnc !== 'string') {
      return NextResponse.json({ error: 'Неверный формат' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { e2ePub: pub, e2eSalt: salt, e2ePrivEnc: privEnc },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}
