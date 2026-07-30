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
    email: '', password: '', displayName: '', confirmPassword: '',
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

      toast.success('Аккаунт создан!')
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-bg-dark via-bg to-bg-dark p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-secondary to-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-secondary/25">
            <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.524 3.66 1.43 5.18L2 22l4.82-1.43A9.958 9.958 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold">KaltenGram</h1>
          <p className="text-text-secondary mt-2">Создайте новый аккаунт</p>
        </div>

        <div className="card p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Имя</label>
              <input
                type="text"
                className="input"
                placeholder="Иван Иванов"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Email</label>
              <input
                type="email"
                className="input"
                placeholder="example@mail.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Пароль</label>
              <input
                type="password"
                className="input"
                placeholder="Минимум 6 символов"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Подтвердите пароль</label>
              <input
                type="password"
                className="input"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full text-base">
              {loading ? 'Регистрация...' : 'Создать аккаунт'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-700/20 text-center">
            <p className="text-text-secondary">
              Уже есть аккаунт?{' '}
              <Link href="/login" className="text-primary hover:text-primary-hover font-medium">
                Войти
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
