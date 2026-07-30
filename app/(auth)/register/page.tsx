'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    confirmPassword: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    if (form.password !== form.confirmPassword) {
      toast.error('Пароли не совпадают')
      setLoading(false)
      return
    }

    if (form.password.length < 6) {
      toast.error('Пароль должен быть минимум 6 символов')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          displayName: form.displayName,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error)
        setLoading(false)
        return
      }

      toast.success('Регистрация успешна!')
      
      const result = await signIn('credentials', {
        email: form.email,
        password: form.password,
        redirect: false,
      })

      if (result?.ok) {
        router.push('/chats')
        router.refresh()
      }
    } catch {
      toast.error('Ошибка сервера')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-tg-bg-dark p-4">
      <div className="w-full max-w-md tg-card p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-tg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">Создать аккаунт</h1>
          <p className="text-tg-text-secondary mt-2">Присоединяйтесь к Messenger</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-tg-text-secondary mb-1">Имя</label>
            <input
              type="text"
              className="tg-input"
              placeholder="Иван Иванов"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-tg-text-secondary mb-1">Email</label>
            <input
              type="email"
              className="tg-input"
              placeholder="your@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-sm text-tg-text-secondary mb-1">Пароль</label>
            <input
              type="password"
              className="tg-input"
              placeholder="Минимум 6 символов"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm text-tg-text-secondary mb-1">Подтвердите пароль</label>
            <input
              type="password"
              className="tg-input"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="tg-button-primary w-full">
            {loading ? 'Регистрация...' : 'Создать аккаунт'}
          </button>
        </form>

        <p className="text-center mt-6 text-tg-text-secondary">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="text-tg-primary hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </div>
  )
}
