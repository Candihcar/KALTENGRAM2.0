import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  try {
    const { name, members } = await request.json()
    if (!name || !members?.length) {
      return NextResponse.json({ error: 'Нужно имя и участники' }, { status: 400 })
    }

    const allMembers = [...new Set([...members, session.user.id])]

    const chat = await prisma.chat.create({
      data: {
        type: 'GROUP',
        name,
        members: {
          create: allMembers.map((userId: string) => ({
            userId,
            role: userId === session.user.id ? 'ADMIN' : 'MEMBER',
          })),
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
