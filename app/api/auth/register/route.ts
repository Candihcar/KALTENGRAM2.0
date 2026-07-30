import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { generateUsername } from '@/lib/utils'
import { z } from 'zod'

const registerSchema = z.object({
  email: z.string().email('Неверный формат email'),
  password: z.string().min(6, 'Пароль должен быть минимум 6 символов'),
  displayName: z.string().min(2, 'Имя должно быть минимум 2 символа').max(50),
})

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`register:${ip}`, 3, 60_000)

  if (!success) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Подождите минуту.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const { email, password, displayName } = registerSchema.parse(body)

    const existingEmail = await prisma.user.findUnique({ where: { email } })
    if (existingEmail) {
      return NextResponse.json(
        { error: 'Этот email уже зарегистрирован' },
        { status: 400 }
      )
    }

    const username = generateUsername(email)
    const existingUsername = await prisma.user.findUnique({ where: { username } })
    if (existingUsername) {
      return NextResponse.json(
        { error: 'Попробуйте другой email' },
        { status: 400 }
      )
    }

    const passwordHash = await hash(password, 12)

    const user = await prisma.user.create({
      data: { email, username, displayName, passwordHash },
      select: { id: true, email: true, username: true, displayName: true },
    })

    return NextResponse.json(
      { message: 'Регистрация успешна', user },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Ошибка сервера' },
      { status: 500 }
    )
  }
}
