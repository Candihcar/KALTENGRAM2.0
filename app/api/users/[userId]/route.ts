import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getMySpaceIds } from '@/lib/space'

export async function GET(request: Request, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  if (params.userId !== session.user.id) {
    const mySpaceIds = await getMySpaceIds(session.user.id)
    const shared = await prisma.spaceMember.findFirst({
      where: { userId: params.userId, spaceId: { in: mySpaceIds } },
    })
    if (!shared) {
      return NextResponse.json({ error: 'Не найден' }, { status: 404 })
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, username: true, displayName: true, image: true, bio: true, online: true, lastSeen: true, createdAt: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'Не найден' }, { status: 404 })
  }

  return NextResponse.json(user)
}

export async function PATCH(request: Request, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.id !== params.userId) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
  }

  try {
    const { displayName, bio, image, username } = await request.json()
    const data: Record<string, string> = {}
    if (displayName) data.displayName = displayName
    if (bio !== undefined) data.bio = bio
    if (image) data.image = image
    if (username) {
      const existing = await prisma.user.findUnique({ where: { username } })
      if (existing && existing.id !== params.userId) {
        return NextResponse.json({ error: 'Username занят' }, { status: 400 })
      }
      data.username = username
    }

    const user = await prisma.user.update({
      where: { id: params.userId },
      data,
      select: { id: true, username: true, displayName: true, image: true, bio: true },
    })

    return NextResponse.json(user)
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}
