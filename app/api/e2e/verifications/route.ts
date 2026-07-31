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

  const rows = await prisma.contactVerification.findMany({
    where: { userId: session.user.id },
    select: { contactId: true, fingerprint: true, updatedAt: true },
  })

  const map: Record<string, { fingerprint: string; verifiedAt: string }> = {}
  for (const r of rows) {
    map[r.contactId] = { fingerprint: r.fingerprint, verifiedAt: r.updatedAt.toISOString() }
  }
  return NextResponse.json(map)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const rateLimited = enforceRateLimit(request, 30, 60_000, 'verify', session.user.id)
  if (rateLimited) return rateLimited

  try {
    const { contactId, fingerprint } = await request.json()
    if (!contactId || typeof fingerprint !== 'string' || !fingerprint) {
      return NextResponse.json({ error: 'Неполные данные' }, { status: 400 })
    }

    const contact = await prisma.user.findUnique({ where: { id: contactId } })
    if (!contact || contact.id === session.user.id) {
      return NextResponse.json({ error: 'Некорректный контакт' }, { status: 400 })
    }

    await prisma.contactVerification.upsert({
      where: { userId_contactId: { userId: session.user.id, contactId } },
      update: { fingerprint },
      create: { userId: session.user.id, contactId, fingerprint },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const url = new URL(request.url)
  const contactId = url.searchParams.get('contactId')
  if (!contactId) {
    return NextResponse.json({ error: 'Нет contactId' }, { status: 400 })
  }

  await prisma.contactVerification.deleteMany({
    where: { userId: session.user.id, contactId },
  })

  return NextResponse.json({ ok: true })
}
