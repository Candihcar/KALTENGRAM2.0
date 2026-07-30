'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { getInitials } from '@/lib/utils'

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ displayName: '', username: '', bio: '' })

  useEffect(() => {
    if (session?.user?.id) {
      fetch(`/api/users/${session.user.id}`).then((r) => r.json()).then((data) => {
        setForm({ displayName: data.displayName || '', username: data.username || '', bio: data.bio || '' })
      }).catch(() => {})
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
        toast.success('Сохранено')
        update()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Ошибка')
      }
    } catch { toast.error('Ошибка') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-dark via-bg to-bg-dark">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/chats" className="p-2 hover:bg-bg-hover rounded-xl transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold">Настройки</h1>
        </div>

        {/* Profile */}
        <div className="card p-8 mb-6">
          <h2 className="text-lg font-medium mb-6">Профиль</h2>

          <div className="flex items-center gap-5 mb-8">
            {session?.user?.image ? (
              <img src={session.user.image} alt="" className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-2xl font-bold">
                {getInitials(session?.user?.name || 'U')}
              </div>
            )}
            <div>
              <p className="font-medium text-lg">{session?.user?.name}</p>
              <p className="text-sm text-text-muted">{session?.user?.email}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Имя</label>
              <input type="text" className="input" value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">Username</label>
              <div className="flex items-center gap-2">
                <span className="text-text-muted">@</span>
                <input type="text" className="input" value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              </div>
            </div>
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">О себе</label>
              <textarea className="input resize-none h-24" value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Расскажите о себе..." />
            </div>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </form>
        </div>

        {/* Account */}
        <div className="card p-8 mb-6">
          <h2 className="text-lg font-medium mb-4">Аккаунт</h2>
          <div className="space-y-3">
            <button onClick={() => signOut({ callbackUrl: '/login' })}
              className="btn-secondary w-full text-left">🚪 Выйти из аккаунта</button>
          </div>
        </div>

        {/* About */}
        <div className="card p-8">
          <h2 className="text-lg font-medium mb-4">О приложении</h2>
          <p className="text-sm text-text-secondary">KaltenGram v1.0 — мессенджер с чатами, группами, фото/видео, аудио и видеозвонками.</p>
        </div>
      </div>
    </div>
  )
}
