'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { getInitials, formatDate } from '@/lib/utils'

interface UserProfile {
  id: string; username: string; displayName: string; image: string | null; bio: string | null
  online: boolean; lastSeen: string; createdAt: string
}

export default function ProfilePage({ params }: { params: { userId: string } }) {
  const { data: session } = useSession()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/users/${params.userId}`).then((r) => r.ok ? r.json() : null).then((d) => { setUser(d); setLoading(false) }).catch(() => setLoading(false))
  }, [params.userId])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center">
        <div className="animate-spin w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg-dark flex items-center justify-center text-text-secondary">
        <div className="text-center">
          <p className="text-lg">Пользователь не найден</p>
          <Link href="/chats" className="text-primary hover:underline mt-2 inline-block">Вернуться</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-dark via-bg to-bg-dark">
      <div className="max-w-md mx-auto p-6">
        <Link href="/chats" className="inline-flex items-center gap-2 text-text-secondary hover:text-text transition-colors mb-6">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Назад
        </Link>

        <div className="card p-8 text-center">
          {user.image ? (
            <img src={user.image} alt="" className="w-28 h-28 rounded-full object-cover mx-auto mb-5 border-4 border-gray-700/30" />
          ) : (
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-3xl font-bold mx-auto mb-5 border-4 border-gray-700/30">
              {getInitials(user.displayName)}
            </div>
          )}

          <h1 className="text-2xl font-bold">{user.displayName}</h1>
          <p className="text-text-secondary">@{user.username}</p>

          {user.bio && (
            <p className="text-sm mt-4 text-text-secondary">{user.bio}</p>
          )}

          <div className="mt-5 flex items-center justify-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${user.online ? 'bg-success' : 'bg-text-muted'}`} />
            <span className={`text-sm ${user.online ? 'text-success' : 'text-text-muted'}`}>
              {user.online ? 'В сети' : 'Был(а) недавно'}
            </span>
          </div>

          <p className="text-xs text-text-muted mt-3">
            Зарегистрирован {formatDate(user.createdAt)}
          </p>
        </div>
      </div>
    </div>
  )
}
