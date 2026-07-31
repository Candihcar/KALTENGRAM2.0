'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { formatDate, formatLastSeen, getInitials } from '@/lib/utils'
import { compressImage } from '@/lib/image-utils'
import { getPusherClient } from '@/lib/pusher-client'
import EmojiPicker from 'emoji-picker-react'
import { CallButton } from '@/components/Call/CallButton'

interface Member {
  userId: string; role: string
  user: { id: string; displayName: string; username: string; image: string | null; online: boolean; lastSeen: string; bio: string | null }
}

interface ChatData {
  id: string; type: string; name: string | null; image: string | null; members: Member[]
}

interface Message {
  id: string; content: string | null; type: string; fileUrl: string | null; createdAt: string
  sender: { id: string; displayName: string; image: string | null; username: string }
  replyTo: { id: string; content: string | null; sender: { displayName: string } } | null
}

export default function ChatPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const chatId = params.chatId as string

  const [chat, setChat] = useState<ChatData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!chatId) return
    setLoading(true)
    fetch(`/api/chats/${chatId}`).then((r) => r.ok ? r.json() : null).then((d) => { setChat(d); setLoading(false) })
    fetchMessages()
  }, [chatId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMessages() {
    const res = await fetch(`/api/chats/${chatId}/messages?limit=50`)
    if (res.ok) {
      const data = await res.json()
      setMessages(data.messages || [])
    }
  }

  const appendMessage = useCallback((msg: Message) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
  }, [])

  const otherUserId = getOtherUser()?.id

  useEffect(() => {
    if (!otherUserId) return
    let disposed = false
    let channel: any = null

    getPusherClient().then((pusher) => {
      if (disposed || !pusher) return
      channel = pusher.subscribe(`presence-${otherUserId}`)
      channel.bind(
        'presence-updated',
        ({ id, online, lastSeen }: { id: string; online: boolean; lastSeen: string }) => {
          setChat((prev) =>
            prev
              ? {
                  ...prev,
                  members: prev.members.map((m) =>
                    m.user.id === id ? { ...m, user: { ...m.user, online, lastSeen } } : m
                  ),
                }
              : prev
          )
        }
      )
    })

    return () => {
      disposed = true
      if (channel) channel.unbind_all()
    }
  }, [otherUserId])

  useEffect(() => {
    if (!chatId || !session?.user?.id) return
    let disposed = false
    const chatChannel: any = { current: null }

    getPusherClient().then((pusher) => {
      if (disposed || !pusher) return
      const channel = pusher.subscribe(`chat-${chatId}`)
      chatChannel.current = channel
      channel.bind('new-message', appendMessage)
    })

    return () => {
      disposed = true
      if (chatChannel.current) {
        chatChannel.current.unbind_all()
        chatChannel.current = null
      }
    }
  }, [chatId, session?.user?.id, appendMessage])

  async function sendMessage(content?: string, type?: string, fileUrl?: string) {
    const msgContent = content || text
    if (!msgContent && !fileUrl) return
    setSending(true)
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msgContent, type: type || 'TEXT', fileUrl }),
      })
      if (res.ok) {
        setText('')
        await fetchMessages()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Ошибка')
      }
    } catch { toast.error('Ошибка') }
    finally { setSending(false) }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Поддерживаются только изображения')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    const formData = new FormData()
    try {
      const compressed = await compressImage(file, 1280, 0.8)
      formData.append('file', compressed)
    } catch {
      formData.append('file', file)
    }
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      if (res.ok) {
        const data = await res.json()
        await sendMessage(undefined, data.type, data.url)
      } else {
        const data = await res.json()
        toast.error(data.error || 'Ошибка загрузки')
      }
    } catch { toast.error('Ошибка') }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function getChatName(): string {
    if (!chat) return ''
    if (chat.type === 'GROUP') return chat.name || 'Без названия'
    const other = chat.members.find((m) => m.userId !== session?.user?.id)
    return other?.user.displayName || 'Неизвестно'
  }

  function getChatImage(): string | null {
    if (!chat) return null
    if (chat.type === 'GROUP') return chat.image
    return chat.members.find((m) => m.userId !== session?.user?.id)?.user.image || null
  }

  function getOtherUser() {
    return chat?.members.find((m) => m.userId !== session?.user?.id)?.user
  }

  function isOtherOnline(): boolean {
    return getOtherUser()?.online || false
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-chat">
        <div className="animate-spin w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-chat text-text-secondary">
        <div className="text-center">
          <p className="text-lg">Чат не найден</p>
          <Link href="/chats" className="text-primary hover:underline mt-2 inline-block">Вернуться</Link>
        </div>
      </div>
    )
  }

  const otherUser = getOtherUser()
  const chatName = getChatName()
  const chatImage = getChatImage()

  return (
    <div className="flex h-screen bg-bg-chat">
        {/* Messages area */}
        <div className="flex-1 flex flex-col">
          {/* Chat header */}
          <div className="px-5 py-3 flex items-center justify-between bg-bg border-b border-gray-700/20">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/chats" className="lg:hidden p-1 -ml-1 hover:bg-bg-hover rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>

              <button onClick={() => setShowInfo(!showInfo)} className="flex items-center gap-3 min-w-0">
                {chatImage ? (
                  <img src={chatImage} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    chat.type === 'GROUP' ? 'bg-gradient-to-br from-secondary to-purple-600' : 'bg-gradient-to-br from-primary to-secondary'
                  }`}>
                    {getInitials(chatName)}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="font-medium text-sm truncate">{chatName}</h2>
                  <p className={`text-xs ${isOtherOnline() ? 'text-success' : 'text-text-muted'}`}>
                    {isOtherOnline() ? 'В сети' : chat.type === 'GROUP' ? `${chat.members.length} участников` : otherUser?.lastSeen ? formatLastSeen(otherUser.lastSeen) : 'Не в сети'}
                  </p>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-1">
              {otherUser && (
                <>
                  <CallButton receiverId={otherUser.id} type="audio" />
                  <CallButton receiverId={otherUser.id} type="video" />
                </>
              )}
              {otherUser && (
                <Link href={`/profile/${otherUser.id}`} className="p-2 hover:bg-bg-hover rounded-lg transition-colors" title="Профиль">
                  <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Link>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-text-secondary text-center">
                <div>
                  <p className="text-lg mb-1">Нет сообщений</p>
                  <p className="text-sm">Напишите первое сообщение</p>
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isOwn = msg.sender.id === session?.user?.id

                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 message-animate`}>
                    <div className={`max-w-[75%] min-w-[100px] ${
                      isOwn
                        ? 'bg-message-out rounded-tl-2xl rounded-tr-sm rounded-bl-2xl rounded-br-lg'
                        : 'bg-message-in rounded-tl-sm rounded-tr-2xl rounded-bl-2xl rounded-br-2xl'
                    } px-4 py-2.5 shadow-sm`}>
                      {!isOwn && chat.type === 'GROUP' && (
                        <p className="text-[11px] text-primary font-medium mb-1">{msg.sender.displayName}</p>
                      )}

                      {msg.replyTo && (
                        <div className={`text-xs p-2 rounded-lg mb-1.5 border-l-2 ${
                          isOwn ? 'bg-blue-900/20 border-primary' : 'bg-gray-700/20 border-text-secondary'
                        }`}>
                          <span className="text-primary font-medium">{msg.replyTo.sender.displayName}</span>
                          <p className="truncate text-text-secondary">{msg.replyTo.content}</p>
                        </div>
                      )}

                      {msg.type === 'IMAGE' && msg.fileUrl && (
                        <div className="mb-1.5 -mx-1">
                          <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                            <img src={msg.fileUrl} alt="" className="max-w-full rounded-xl max-h-72 object-cover cursor-pointer hover:opacity-95 transition-opacity" loading="lazy" />
                          </a>
                        </div>
                      )}

                      {msg.type === 'VIDEO' && msg.fileUrl && (
                        <div className="mb-1.5 -mx-1">
                          <video src={msg.fileUrl} controls className="max-w-full rounded-xl max-h-72" preload="metadata" />
                        </div>
                      )}

                      {msg.content && (
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      )}

                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className={`text-[10px] ${isOwn ? 'text-blue-300/70' : 'text-gray-500'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isOwn && (
                          <svg className="w-3.5 h-3.5 text-blue-300/70" viewBox="0 0 16 11" fill="currentColor">
                            <path d="M11.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 00-.336-.153.457.457 0 00-.336.102.518.518 0 00-.127.356c0 .102.025.204.076.28l2.265 2.36c.102.127.228.19.38.19.153 0 .279-.063.381-.19l6.599-8.16a.477.477 0 00.102-.305.518.518 0 00-.178-.382l-.33-.315z"/>
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-5 py-3 bg-bg border-t border-gray-700/20">
            <div className="flex items-end gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 hover:bg-bg-hover rounded-xl transition-colors flex-shrink-0">
                <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />

              <div className="flex-1 relative">
                <input
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Сообщение..."
                  className="w-full bg-bg-hover text-text rounded-xl pl-4 pr-12 py-3 outline-none placeholder:text-text-muted text-sm"
                />
                <button onClick={() => setShowEmoji(!showEmoji)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-bg-light rounded-lg transition-colors">
                  <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                {showEmoji && (
                  <div className="absolute bottom-full right-0 mb-2 z-50">
                    <EmojiPicker onEmojiClick={(emoji) => { setText((prev) => prev + emoji.emoji); setShowEmoji(false) }} width={320} height={400} />
                  </div>
                )}
              </div>

              <button onClick={() => sendMessage()} disabled={!text.trim() || sending}
                className="p-3 bg-primary text-white rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
                {sending ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Info panel */}
        {showInfo && (
          <div className="w-80 bg-bg border-l border-gray-700/20 p-5 overflow-y-auto animate-fade-in flex-shrink-0">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-medium">Информация</h3>
              <button onClick={() => setShowInfo(false)} className="p-1 hover:bg-bg-hover rounded-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {chat.type === 'GROUP' ? (
              <div className="text-center">
                {chatImage ? (
                  <img src={chatImage} alt="" className="w-24 h-24 rounded-full object-cover mx-auto mb-4" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-secondary to-purple-600 flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                    {getInitials(chatName)}
                  </div>
                )}
                <h4 className="font-medium text-lg">{chatName}</h4>
                <p className="text-sm text-text-muted mb-4">{chat.members.length} участников</p>
                <div className="space-y-2 text-left">
                  {chat.members.map((m) => (
                    <div key={m.userId} className="flex items-center gap-3 py-2">
                      {m.user.image ? (
                        <img src={m.user.image} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold">
                          {getInitials(m.user.displayName)}
                        </div>
                      )}
                      <div>
                        <p className="text-sm">{m.user.displayName}</p>
                        {m.role === 'ADMIN' && <span className="text-[11px] text-text-muted">админ</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : otherUser && (
              <div className="text-center">
                {otherUser.image ? (
                  <img src={otherUser.image} alt="" className="w-24 h-24 rounded-full object-cover mx-auto mb-4" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                    {getInitials(otherUser.displayName)}
                  </div>
                )}
                <h4 className="font-medium text-lg">{otherUser.displayName}</h4>
                <p className="text-sm text-text-muted">@{otherUser.username}</p>
                {otherUser.bio && <p className="text-sm mt-3 text-text-secondary">{otherUser.bio}</p>}
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${otherUser.online ? 'bg-success' : 'bg-text-muted'}`} />
                  <span className={`text-sm ${otherUser.online ? 'text-success' : 'text-text-muted'}`}>
                    {otherUser.online ? 'В сети' : formatLastSeen(otherUser.lastSeen)}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <CallButton receiverId={otherUser.id} type="audio" />
                  <CallButton receiverId={otherUser.id} type="video" />
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  )
}
