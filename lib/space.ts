import { prisma } from '@/lib/prisma'

export const GENERAL_SPACE_ID = 'general'

export async function getMySpaceIds(userId: string): Promise<string[]> {
  const rows = await prisma.spaceMember.findMany({
    where: { userId },
    select: { spaceId: true },
  })
  return rows.map((r) => r.spaceId)
}

export async function getMySpaces(userId: string) {
  return prisma.spaceMember.findMany({
    where: { userId },
    include: { space: { select: { id: true, name: true } } },
  })
}

export async function resolveActiveSpaceId(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeSpaceId: true, spaces: { select: { spaceId: true } } },
  })
  if (!user) return GENERAL_SPACE_ID
  const ids = user.spaces.map((s) => s.spaceId)
  if (user.activeSpaceId && ids.includes(user.activeSpaceId)) return user.activeSpaceId
  if (ids.includes(GENERAL_SPACE_ID)) return GENERAL_SPACE_ID
  return ids[0] || GENERAL_SPACE_ID
}

export async function ensureSpace(id: string, name: string) {
  return prisma.space.upsert({
    where: { id },
    update: {},
    create: { id, name },
  })
}
