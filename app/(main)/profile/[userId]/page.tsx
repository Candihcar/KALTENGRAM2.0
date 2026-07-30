'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getInitials, formatDate } from '@/lib/utils'

interface UserProfile {
  id: string
  username: string
  displayName: string
  image: string | null
  bio: string | null
  online: boolean
  lastSeen: string
  createdAt: string
}

export default function ProfilePage({ params }: { params: { userId: string } }) {
  const { data: session } = useSession()
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/users/${params.userId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        setUser(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [params.userId])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-tg-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center text-tg-text-secondary">
        <div className="text-center">
          <p className="text-lg">Пользователь не найден</p>
          <Link href="/chats" className="text-tg-primary hover:underline mt-2 inline-block">
            Вернуться
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-md mx-auto p-6">
        <div className="tg-card p-8 text-center">
          {user.image ? (
            <img src={user.image} alt="" className="w-24 h-24 rounded-full object-cover mx-auto mb-4" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-tg-primary flex items-center justify-center text-3xl font-bold mx-auto mb-4">
              {getInitials(user.displayName)}
            </div>
          )}

          <h1 className="text-xl font-bold">{user.displayName}</h1>
          <p className="text-tg-text-secondary">@{user.username}</p>

          {user.bio && (
            <p className="text-sm mt-3 text-tg-text-secondary">{user.bio}</p>
          )}

          <div className="mt-4 flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${user.online ? 'bg-tg-success' : 'bg-tg-text-muted'}`} />
            <span className={`text-sm ${user.online ? 'text-tg-success' : 'text-tg-text-muted'}`}>
              {user.online ? 'В сети' : 'Был(а) недавно'}
            </span>
          </div>

          <p className="text-xs text-tg-text-muted mt-2">
            Зарегистрирован {formatDate(user.createdAt)}
          </p>
        </div>
      </div>
    </div>
  )
}
