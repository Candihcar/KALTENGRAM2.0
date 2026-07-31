import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ call: null })
  }

  const call = await prisma.call.findFirst({
    where: {
      OR: [
        { receiverId: session.user.id, status: 'RINGING' },
        { callerId: session.user.id, status: 'ONGOING' },
      ],
    },
    orderBy: { startedAt: 'desc' },
    include: {
      caller: { select: { id: true, displayName: true, image: true } },
      receiver: { select: { id: true, displayName: true, image: true } },
    },
  })

  return NextResponse.json({ call })
}
