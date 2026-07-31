import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { enforceRateLimit } from '@/lib/rate-limit'

const MAX_SIZE = 4 * 1024 * 1024

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const rateLimited = enforceRateLimit(request, 30, 60_000, 'upload', session.user.id)
  if (rateLimited) return rateLimited

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Файл не найден' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Поддерживаются только изображения' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Файл слишком большой (макс 4MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const dataUrl = `data:${file.type};base64,${buffer.toString('base64')}`

    return NextResponse.json({ url: dataUrl, type: 'IMAGE' })
  } catch {
    return NextResponse.json({ error: 'Ошибка загрузки' }, { status: 500 })
  }
}
