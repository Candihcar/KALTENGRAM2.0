import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { generateUsername } from '@/lib/utils'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email('Неверный email'),
  password: z.string().min(6, 'Пароль минимум 6 символов'),
  displayName: z.string().min(2, 'Имя минимум 2 символа').max(50),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, displayName } = schema.parse(body)

    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) {
      return NextResponse.json({ error: 'Email уже зарегистрирован' }, { status: 400 })
    }

    let username = generateUsername(email)
    const usernameExists = await prisma.user.findUnique({ where: { username } })
    if (usernameExists) {
      username = `${username}_${Math.random().toString(36).slice(2, 5)}`
    }

    const passwordHash = await hash(password, 12)

    await prisma.user.create({
      data: { email, username, displayName, passwordHash },
    })

    return NextResponse.json({ message: 'Регистрация успешна' }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
