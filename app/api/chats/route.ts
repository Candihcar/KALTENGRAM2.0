import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveActiveSpaceId } from '@/lib/space'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const activeSpaceId = await resolveActiveSpaceId(session.user.id)

  const chats = await prisma.chat.findMany({
    where: {
      members: { some: { userId: session.user.id } },
      spaceId: activeSpaceId,
    },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true, image: true, online: true, lastSeen: true },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          sender: { select: { id: true, displayName: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(chats)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  try {
    const { userId } = await request.json()

    const activeSpaceId = await resolveActiveSpaceId(session.user.id)

    const otherMember = await prisma.spaceMember.findUnique({
      where: { spaceId_userId: { spaceId: activeSpaceId, userId } },
    })
    if (!otherMember) {
      return NextResponse.json({ error: 'Пользователь недоступен в этом пространстве' }, { status: 403 })
    }

    const existing = await prisma.chat.findFirst({
      where: {
        type: 'DIRECT',
        spaceId: activeSpaceId,
        AND: [
          { members: { some: { userId: session.user.id } } },
          { members: { some: { userId } } },
        ],
      },
    })

    if (existing) {
      return NextResponse.json(existing)
    }

    const chat = await prisma.chat.create({
      data: {
        type: 'DIRECT',
        spaceId: activeSpaceId,
        members: {
          create: [
            { userId: session.user.id, role: 'MEMBER' },
            { userId, role: 'MEMBER' },
          ],
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, displayName: true, image: true } },
          },
        },
      },
    })

    return NextResponse.json(chat, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Ошибка' }, { status: 500 })
  }
}
