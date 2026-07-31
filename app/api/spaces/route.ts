import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMySpaces, resolveActiveSpaceId } from '@/lib/space'
import { enforceRateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const rows = await getMySpaces(session.user.id)
  const active = await resolveActiveSpaceId(session.user.id)

  return NextResponse.json({
    spaces: rows.map((r) => r.space),
    active,
  })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const rateLimited = enforceRateLimit(request, 30, 60_000, 'switch-space', session.user.id)
  if (rateLimited) return rateLimited

  try {
    const { spaceId } = await request.json()
    if (!spaceId) {
      return NextResponse.json({ error: 'Нет spaceId' }, { status: 400 })
    }

    const member = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId, userId: session.user.id } },
    })
    if (!member) {
      return NextResponse.json({ error: 'Нет доступа к пространству' }, { status: 403 })
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { activeSpaceId: spaceId },
    })

    return NextResponse.json({ ok: true, active: spaceId })
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}
