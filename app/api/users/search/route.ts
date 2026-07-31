import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('q')

  if (!raw || raw.trim().length < 1) return NextResponse.json([])

  const query = raw.trim().replace(/^@/, '')

  const users = await prisma.user.findMany({
    where: {
      id: { not: session.user.id },
      username: { contains: query, mode: 'insensitive' },
    },
    select: { id: true, username: true, displayName: true, image: true, online: true },
    take: 20,
  })

  return NextResponse.json(users)
}
