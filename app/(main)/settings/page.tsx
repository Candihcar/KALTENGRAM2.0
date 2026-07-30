'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { getInitials } from '@/lib/utils'

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    displayName: '',
    username: '',
    bio: '',
  })

  useEffect(() => {
    if (session?.user?.id) {
      fetch(`/api/users/${session.user.id}`)
        .then((res) => res.json())
        .then((data) => {
          setForm({
            displayName: data.displayName || '',
            username: data.username || '',
            bio: data.bio || '',
          })
        })
        .catch(() => {})
    }
  }, [session?.user?.id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch(`/api/users/${session?.user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        toast.success('Настройки сохранены')
        update()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Ошибка')
      }
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteAccount() {
    if (!confirm('Вы уверены? Это действие нельзя отменить.')) return
    toast.error('Удаление аккаунта временно недоступно')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Настройки</h1>

        {/* Profile section */}
        <div className="tg-card p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Профиль</h2>

          <div className="flex items-center gap-4 mb-6">
            {session?.user?.image ? (
              <img src={session.user.image} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-tg-primary flex items-center justify-center text-xl font-bold">
                {getInitials(session?.user?.name || 'U')}
              </div>
            )}
            <div>
              <p className="font-medium">{session?.user?.name}</p>
              <p className="text-sm text-tg-text-muted">{session?.user?.email}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm text-tg-text-secondary mb-1">Имя</label>
              <input
                type="text"
                className="tg-input"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm text-tg-text-secondary mb-1">Username</label>
              <div className="flex items-center gap-2">
                <span className="text-tg-text-muted">@</span>
                <input
                  type="text"
                  className="tg-input"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-tg-text-secondary mb-1">О себе</label>
              <textarea
                className="tg-input resize-none h-24"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Расскажите о себе..."
              />
            </div>

            <button type="submit" disabled={loading} className="tg-button-primary">
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </form>
        </div>

        {/* Appearance */}
        <div className="tg-card p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Внешний вид</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Тема</span>
              <span className="text-sm text-tg-text-secondary">Тёмная (по умолчанию)</span>
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="tg-card p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Аккаунт</h2>
          <div className="space-y-3">
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="tg-button-secondary w-full text-left"
            >
              Выйти из аккаунта
            </button>
            <button
              onClick={handleDeleteAccount}
              className="tg-button-danger w-full text-left"
            >
              Удалить аккаунт
            </button>
          </div>
        </div>

        {/* About */}
        <div className="tg-card p-6">
          <h2 className="text-lg font-medium mb-4">О приложении</h2>
          <p className="text-sm text-tg-text-secondary">
            Messenger v1.0.0 — современный мессенджер с поддержкой личных и групповых чатов,
            отправки фото и видео, аудио и видеозвонков.
          </p>
        </div>
      </div>
    </div>
  )
}
