import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const users = await prisma.user.findMany({
    where: { id: { not: session.user.id } },
    select: { id: true, username: true, displayName: true, image: true, online: true, bio: true },
    take: 50,
  })

  return NextResponse.json(users)
}
