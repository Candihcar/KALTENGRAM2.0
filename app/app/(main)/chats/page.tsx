'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDate, getInitials } from '@/lib/utils'
import { CallButton } from '@/components/Call/CallButton'
import { CallUI } from '@/components/Call/CallUI'

interface Chat {
  id: string; type: string; name: string | null; image: string | null; updatedAt: string
  members: { userId: string; user: { id: string; displayName: string; image: string | null; online: boolean; lastSeen: string } }[]
  messages: { sender: { displayName: string }; content: string | null; type: string; createdAt: string }[]
}

export default function ChatsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const [activeCall, setActiveCall] = useState<any>(null)

  useEffect(() => { fetchChats() }, [])
  useEffect(() => { if (!showSearch) { setSearchQuery(''); setUsers([]) } }, [showSearch])

  useEffect(() => {
    if (!searchQuery.trim()) { setUsers([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`)
      if (res.ok) setUsers(await res.json())
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  async function fetchChats() {
    try {
      const res = await fetch('/api/chats')
      if (res.ok) setChats(await res.json())
    } catch {} finally { setLoading(false) }
  }

  function getChatName(chat: Chat): string {
    if (chat.type === 'GROUP') return chat.name || 'Без названия'
    const other = chat.members.find((m) => m.userId !== session?.user?.id)
    return other?.user.displayName || 'Неизвестно'
  }

  function getChatImage(chat: Chat): string | null {
    if (chat.type === 'GROUP') return chat.image
    return chat.members.find((m) => m.userId !== session?.user?.id)?.user.image || null
  }

  function isOnline(chat: Chat): boolean {
    if (chat.type === 'GROUP') return false
    return chat.members.find((m) => m.userId !== session?.user?.id)?.user.online || false
  }

  function getOtherUserId(chat: Chat): string | undefined {
    return chat.members.find((m) => m.userId !== session?.user?.id)?.user.id
  }

  function getLastMessage(chat: Chat): string {
    if (!chat.messages?.[0]) return 'Нет сообщений'
    const m = chat.messages[0]
    const prefix = m.type !== 'TEXT' ? (m.type === 'IMAGE' ? '📷 ' : m.type === 'VIDEO' ? '🎬 ' : '📎 ') : ''
    return prefix + (m.content || '')
  }

  const filteredChats = chats.filter((c) =>
    getChatName(c).toLowerCase().includes(search.toLowerCase())
  )

  async function startChat(userId: string) {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      const chat = await res.json()
      router.push(`/chats/${chat.id}`)
    }
  }

  async function createGroup() {
    if (selectedUsers.length < 1) return
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Группа ${selectedUsers.length + 1}`,
        members: selectedUsers.map((u: any) => u.id),
      }),
    })
    if (res.ok) {
      const chat = await res.json()
      router.push(`/chats/${chat.id}`)
      setShowSearch(false)
      setSelectedUsers([])
    }
  }

  const [selectedUsers, setSelectedUsers] = useState<any[]>([])

  return (
    <>
      {activeCall && (
        <CallUI call={activeCall} currentUserId={session?.user?.id || ''} onEnd={() => setActiveCall(null)} />
      )}

      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-96 bg-bg flex flex-col h-full border-r border-gray-700/20 flex-shrink-0">
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-gray-700/20">
            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-3 hover:bg-bg-hover rounded-xl p-1.5 transition-colors">
                {session?.user?.image ? (
                  <img src={session.user.image} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold">
                    {getInitials(session?.user?.name || 'U')}
                  </div>
                )}
                <span className="font-medium text-sm">{session?.user?.name}</span>
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 w-56 card py-1 z-20 shadow-xl border border-gray-700/30">
                    <Link href="/settings" className="block px-4 py-2.5 text-sm hover:bg-bg-hover transition-colors" onClick={() => setShowMenu(false)}>
                      ⚙️ Настройки
                    </Link>
                    <button onClick={() => { setShowMenu(false); signOut({ callbackUrl: '/login' }) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-danger hover:bg-bg-hover transition-colors">
                      🚪 Выйти
                    </button>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setShowSearch(!showSearch)}
              className="p-2 hover:bg-bg-hover rounded-xl transition-colors">
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Search users panel */}
          {showSearch && (
            <div className="border-b border-gray-700/20 p-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => { setShowSearch(false); setSelectedUsers([]) }} className="p-1 hover:text-text transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <input type="text" className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
                  placeholder="Поиск пользователей..." value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
              </div>

              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {selectedUsers.map((u: any) => (
                    <span key={u.id} className="inline-flex items-center gap-1 bg-primary/20 text-primary text-xs px-2.5 py-1 rounded-full">
                      {u.displayName}
                      <button onClick={() => setSelectedUsers(selectedUsers.filter((s: any) => s.id !== u.id))} className="hover:text-danger">×</button>
                    </span>
                  ))}
                  <button onClick={createGroup} className="text-xs text-primary hover:underline ml-1">
                    Создать группу
                  </button>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto space-y-1">
                {users.map((user) => (
                  <button key={user.id} onClick={() => {
                    if (selectedUsers.length > 0 || searchQuery.includes(',')) {
                      setSelectedUsers((prev) => prev.find((u) => u.id === user.id) ? prev : [...prev, user])
                    } else {
                      startChat(user.id)
                    }
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-bg-hover transition-colors text-left">
                    {user.image ? (
                      <img src={user.image} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold">
                        {getInitials(user.displayName)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.displayName}</p>
                      <p className="text-xs text-text-muted">@{user.username}</p>
                    </div>
                    {user.online && <div className="w-2.5 h-2.5 bg-success rounded-full" />}
                  </button>
                ))}
                {searchQuery && users.length === 0 && (
                  <p className="text-sm text-text-muted py-3 text-center">Ничего не найдено</p>
                )}
              </div>
            </div>
          )}

          {/* Search chats */}
          <div className="px-4 pt-3 pb-1">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" className="w-full bg-bg-hover text-sm text-text rounded-xl pl-10 pr-4 py-2 outline-none placeholder:text-text-muted"
                placeholder="Поиск чатов..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {/* Chats list */}
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="p-6 space-y-4">
                {[1,2,3,4,5].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-12 h-12 rounded-full bg-bg-hover" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-bg-hover rounded w-3/4" />
                      <div className="h-3 bg-bg-hover rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-secondary p-8 text-center">
                <div className="w-16 h-16 mb-4 rounded-full bg-bg-light flex items-center justify-center">
                  <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="text-sm">Нет чатов. Начните новый диалог.</p>
              </div>
            ) : (
              filteredChats.map((chat) => {
                const name = getChatName(chat)
                const img = getChatImage(chat)
                const otherId = getOtherUserId(chat)

                return (
                  <Link key={chat.id} href={`/chats/${chat.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-bg-hover/50 transition-colors group">
                    <div className="relative flex-shrink-0">
                      {img ? (
                        <img src={img} alt="" className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-bold ${
                          chat.type === 'GROUP' ? 'bg-gradient-to-br from-secondary to-purple-600' : 'bg-gradient-to-br from-primary to-secondary'
                        }`}>
                          {getInitials(name)}
                        </div>
                      )}
                      {isOnline(chat) && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-success rounded-full border-[3px] border-bg" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium text-sm truncate">{name}</h3>
                        {chat.messages?.[0] && (
                          <span className="text-[11px] text-text-muted ml-2 flex-shrink-0">
                            {formatDate(chat.messages[0].createdAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-secondary truncate mt-0.5">
                        {getLastMessage(chat)}
                      </p>
                    </div>

                    {otherId && (
                      <div className="hidden group-hover:flex items-center gap-0.5 ml-1 flex-shrink-0">
                        <CallButton
                          receiverId={otherId}
                          onCall={(call) => setActiveCall(call)}
                          type="audio"
                        />
                      </div>
                    )}
                  </Link>
                )
              })
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col bg-bg-chat">
          {chats.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-text-secondary">
              <div className="text-center">
                <div className="w-28 h-28 mx-auto mb-6 rounded-full bg-bg-light/50 flex items-center justify-center">
                  <svg className="w-14 h-14 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-semibold mb-2">KaltenGram</h2>
                <p className="text-sm">Выберите чат или начните новый диалог</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-secondary">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-bg-light/50 flex items-center justify-center">
                  <svg className="w-12 h-12 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h2 className="text-xl font-medium mb-1">Выберите чат</h2>
                <p className="text-sm">Чат не выбран</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
