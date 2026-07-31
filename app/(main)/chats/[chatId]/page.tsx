'use client'

import { useEffect, useState, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { formatDate, formatLastSeen, getInitials } from '@/lib/utils'
import { compressImage } from '@/lib/image-utils'
import { getPusherClient } from '@/lib/pusher-client'
import EmojiPicker from 'emoji-picker-react'
import { CallButton } from '@/components/Call/CallButton'
import {
  e2eDecryptDataUrl,
  e2eDecryptText,
  e2eEncryptDataUrl,
  e2eEncryptText,
  e2eFingerprintEmoji,
  e2eNewMessageKey,
  e2eUnwrapMessageKey,
  e2eWrapMessageKey,
} from '@/lib/e2e'
import {
  getE2EState,
  getPubKeys,
  isE2EUnlocked,
  subscribeE2E,
} from '@/lib/e2e-store'

interface Member {
  userId: string; role: string
  user: { id: string; displayName: string; username: string; image: string | null; online: boolean; lastSeen: string; bio: string | null }
}

interface ChatData {
  id: string; type: string; name: string | null; image: string | null; members: Member[]
}

interface WrappedKey {
  userId: string; iv: string; key: string
}

interface Attachment {
  id: string; url: string | null; type: string; ciphertext: string | null; nonce: string | null
}

interface Message {
  id: string; content: string | null; type: string; fileUrl: string | null; readAt: string | null; createdAt: string
  ciphertext: string | null; nonce: string | null; wrappedKeys: WrappedKey[] | null
  sender: { id: string; displayName: string; image: string | null; username: string; e2ePub: string | null }
  replyTo: {
    id: string; content: string | null; ciphertext: string | null; nonce: string | null; wrappedKeys: WrappedKey[] | null
    sender: { id: string; displayName: string; e2ePub: string | null }
  } | null
  attachments: Attachment[]
}

interface DecodedMessage {
  text: string | null
  images: string[]
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(new Error('read-failed'))
    fr.readAsDataURL(file)
  })
}

export default function ChatPage() {
  const { data: session } = useSession()
  const params = useParams()
  const router = useRouter()
  const chatId = params.chatId as string

  const [chat, setChat] = useState<ChatData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [decoded, setDecoded] = useState<Record<string, DecodedMessage>>({})
  const [replyPreviews, setReplyPreviews] = useState<Record<string, string>>({})
  const [unlocked, setUnlocked] = useState(false)
  const [verifications, setVerifications] = useState<Record<string, { fingerprint: string; verifiedAt: string }>>({})
  const [chatFingerprint, setChatFingerprint] = useState<string[] | null>(null)
  const [fingerprintKey, setFingerprintKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [previews, setPreviews] = useState<{ id: string; url: string; file: File }[]>([])
  const [lightbox, setLightbox] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setUnlocked(isE2EUnlocked())
    return subscribeE2E(() => setUnlocked(isE2EUnlocked()))
  }, [])

  useEffect(() => {
    if (!chatId) return
    setLoading(true)
    fetch(`/api/chats/${chatId}`).then((r) => r.ok ? r.json() : null).then((d) => { setChat(d); setLoading(false) })
    if (unlocked) fetchMessages()
  }, [chatId, unlocked])

  useEffect(() => {
    if (!chat || !unlocked) return
    getPubKeys(chat.members.map((m) => m.userId))
  }, [chat, unlocked])

  useEffect(() => {
    if (!chat || !unlocked || chat.type === 'GROUP') return
    const other = getOtherUser()
    if (!other) return
    let disposed = false
    async function load() {
      const st = getE2EState()
      const pubs = await getPubKeys([other.id])
      const otherPub = pubs.get(other.id)
      if (st && otherPub) {
        try {
          const words = await e2eFingerprintEmoji(st.pubB64, otherPub)
          if (!disposed) {
            setChatFingerprint(words)
            setFingerprintKey(words.join(' '))
          }
        } catch {
          if (!disposed) setChatFingerprint(null)
        }
      } else if (!disposed) {
        setChatFingerprint(null)
        setFingerprintKey(null)
      }
      try {
        const res = await fetch('/api/e2e/verifications')
        if (res.ok && !disposed) setVerifications(await res.json())
      } catch {}
    }
    load()
    return () => {
      disposed = true
    }
  }, [chat, unlocked])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
      channel.bind('new-message', () => {
        fetchMessages()
      })
      channel.bind(
        'messages-read',
        ({ ids, readAt }: { ids: string[]; readAt: string }) => {
          setMessages((prev) =>
            prev.map((m) => (ids.includes(m.id) ? { ...m, readAt } : m))
          )
        }
      )
    })

    return () => {
      disposed = true
      if (chatChannel.current) {
        chatChannel.current.unbind_all()
        chatChannel.current = null
      }
    }
  }, [chatId, session?.user?.id])

  async function fetchMessages() {
    if (!isE2EUnlocked()) return
    const res = await fetch(`/api/chats/${chatId}/messages?limit=50`)
    if (res.ok) {
      const data = await res.json()
      const list = data.messages || []
      setMessages(list)
      void decryptMessages(list)
      markRead()
    }
  }

  async function decryptMessages(list: Message[]) {
    const st = getE2EState()
    if (!st) return
    const out: Record<string, DecodedMessage> = {}
    const replies: Record<string, string> = {}
    for (const m of list) {
      if (m.ciphertext && m.nonce && m.wrappedKeys?.length && m.sender.e2ePub) {
        const wk = m.wrappedKeys.find((w) => w.userId === st.userId)
        if (wk) {
          try {
            const mk = await e2eUnwrapMessageKey(wk, m.sender.e2ePub, st.privKey)
            const text = await e2eDecryptText({ ciphertext: m.ciphertext, nonce: m.nonce }, mk)
            const images: string[] = []
            for (const a of m.attachments || []) {
              if (a.ciphertext && a.nonce) {
                images.push(await e2eDecryptDataUrl({ ciphertext: a.ciphertext, nonce: a.nonce }, mk))
              }
            }
            out[m.id] = { text, images }
          } catch {
            out[m.id] = { text: null, images: [] }
          }
        }
      }
      const r = m.replyTo
      if (r && r.ciphertext && r.nonce && r.wrappedKeys?.length && r.sender.e2ePub) {
        const wk = r.wrappedKeys.find((w) => w.userId === st.userId)
        if (wk) {
          try {
            const mk = await e2eUnwrapMessageKey(wk, r.sender.e2ePub, st.privKey)
            replies[r.id] = await e2eDecryptText({ ciphertext: r.ciphertext, nonce: r.nonce }, mk)
          } catch {}
        }
      }
    }
    setDecoded(out)
    setReplyPreviews(replies)
  }

  async function sendMessage() {
    const msgContent = text.trim()
    if (!msgContent && previews.length === 0) return
    const st = getE2EState()
    if (!st) {
      toast.error('Переписка заблокирована')
      return
    }
    setSending(true)
    try {
      const members = chat?.members || []
      const pubs = await getPubKeys(members.map((m) => m.userId))
      const missing = members.find((m) => !pubs.get(m.userId))
      if (missing) {
        toast.error('Не удалось отправить: у участника не настроено шифрование')
        return
      }

      const mk = await e2eNewMessageKey()
      let ciphertext: string | null = null
      let nonce: string | null = null
      if (msgContent) {
        const enc = await e2eEncryptText(msgContent, mk)
        ciphertext = enc.ciphertext
        nonce = enc.nonce
      }

      const wrappedKeys: WrappedKey[] = []
      for (const m of members) {
        const wrapped = await e2eWrapMessageKey(mk, pubs.get(m.userId)!, st.privKey)
        wrappedKeys.push({ userId: m.userId, ...wrapped })
      }

      const encAttachments: { type: string; ciphertext: string; nonce: string }[] = []
      for (const p of previews) {
        const dataUrl = await fileToDataUrl(p.file)
        const enc = await e2eEncryptDataUrl(dataUrl, mk)
        encAttachments.push({ type: 'IMAGE', ciphertext: enc.ciphertext, nonce: enc.nonce })
      }

      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciphertext,
          nonce,
          wrappedKeys: wrappedKeys.length ? wrappedKeys : undefined,
          type: encAttachments.length ? 'IMAGE' : 'TEXT',
          attachments: encAttachments,
        }),
      })
      if (res.ok) {
        setText('')
        setPreviews([])
        await fetchMessages()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Ошибка')
      }
    } catch { toast.error('Ошибка') }
    finally { setSending(false) }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!files.length) return

    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length !== files.length) toast.error('Поддерживаются только изображения')

    for (const file of images) {
      let f = file
      try {
        f = await compressImage(file, 1280, 0.8)
      } catch {}
      const url = URL.createObjectURL(f)
      setPreviews((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, url, file: f },
      ])
    }
  }

  async function markRead() {
    try {
      await fetch(`/api/chats/${chatId}/read`, { method: 'POST' })
    } catch {}
  }

  async function verifyContact() {
    if (!otherUser || !fingerprintKey) return
    try {
      const res = await fetch('/api/e2e/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: otherUser.id, fingerprint: fingerprintKey }),
      })
      if (res.ok) {
        setVerifications((prev) => ({
          ...prev,
          [otherUser.id]: { fingerprint: fingerprintKey, verifiedAt: new Date().toISOString() },
        }))
        toast.success('Контакт проверен')
      } else {
        toast.error('Ошибка')
      }
    } catch {
      toast.error('Ошибка')
    }
  }

  async function unverifyContact() {
    if (!otherUser) return
    try {
      const res = await fetch(`/api/e2e/verifications?contactId=${otherUser.id}`, { method: 'DELETE' })
      if (res.ok) {
        setVerifications((prev) => {
          const next = { ...prev }
          delete next[otherUser.id]
          return next
        })
        toast.success('Отметка снята')
      }
    } catch {}
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
  const verification = otherUser ? verifications[otherUser.id] : undefined
  const isVerified = !!verification && !!fingerprintKey && verification.fingerprint === fingerprintKey
  const keyChanged = !!verification && !!fingerprintKey && verification.fingerprint !== fingerprintKey

  return (
    <div className="flex h-dvh bg-bg-chat overscroll-x-none">
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
                  <div className="flex items-center gap-1 min-w-0">
                    <h2 className="font-medium text-sm truncate">{chatName}</h2>
                    {isVerified && (
                      <svg className="w-4 h-4 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
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
                const dec = decoded[msg.id]
                const isLegacy = !msg.ciphertext
                const hadAttachments = (msg.attachments && msg.attachments.length > 0) || !!msg.fileUrl
                const images = dec?.images || []
                const replyText =
                  msg.replyTo && !msg.replyTo.content
                    ? replyPreviews[msg.replyTo.id]
                      ? replyPreviews[msg.replyTo.id]
                      : '🔒 Зашифрованное сообщение'
                    : msg.replyTo?.content || null

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
                          <p className="truncate text-text-secondary">{replyText}</p>
                        </div>
                      )}

                      {isLegacy ? (
                        <div className="flex items-center gap-2 py-1">
                          <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <p className="text-sm text-text-muted italic">Сообщение недоступно (отправлено до включения E2E)</p>
                        </div>
                      ) : !dec ? (
                        <p className="text-sm text-text-muted italic py-1">Не удалось расшифровать сообщение</p>
                      ) : (
                        <>
                          {images.length > 0 && (
                            <div className={`mb-1.5 -mx-1 ${images.length > 1 ? 'grid grid-cols-2 gap-1' : ''}`}>
                              {images.map((url, i) => (
                                <button
                                  key={`${msg.id}-img-${i}`}
                                  type="button"
                                  onClick={() => setLightbox(url)}
                                  className="block w-full p-0 border-0 bg-transparent cursor-zoom-in text-left"
                                >
                                  <img
                                    src={url}
                                    alt=""
                                    className="max-w-full rounded-xl max-h-72 object-cover hover:opacity-95 transition-opacity w-full"
                                    loading="lazy"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                          {hadAttachments && images.length === 0 && (
                            <p className="text-sm text-text-muted italic mb-1.5">🔒 Вложение не расшифровано</p>
                          )}
                          {dec.text && (
                            <p className="text-sm whitespace-pre-wrap break-words">{dec.text}</p>
                          )}
                        </>
                      )}

                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className={`text-[10px] ${isOwn ? 'text-blue-300/70' : 'text-gray-500'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isOwn && (msg.readAt ? (
                          <svg className="w-4 h-3 text-success" viewBox="0 0 18 11" fill="currentColor" aria-label="Прочитано">
                            <title>Прочитано</title>
                            <path transform="translate(7.6 0)" d="M11.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 00-.336-.153.457.457 0 00-.336.102.518.518 0 00-.127.356c0 .102.025.204.076.28l2.265 2.36c.102.127.228.19.38.19.153 0 .279-.063.381-.19l6.599-8.16a.477.477 0 00.102-.305.518.518 0 00-.178-.382l-.33-.315z"/>
                            <path transform="translate(0 0)" d="M11.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 00-.336-.153.457.457 0 00-.336.102.518.518 0 00-.127.356c0 .102.025.204.076.28l2.265 2.36c.102.127.228.19.38.19.153 0 .279-.063.381-.19l6.599-8.16a.477.477 0 00.102-.305.518.518 0 00-.178-.382l-.33-.315z"/>
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3 text-success" viewBox="0 0 16 11" fill="currentColor" aria-label="Отправлено">
                            <title>Отправлено</title>
                            <path d="M11.071.653a.457.457 0 00-.304-.102.493.493 0 00-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 00-.336-.153.457.457 0 00-.336.102.518.518 0 00-.127.356c0 .102.025.204.076.28l2.265 2.36c.102.127.228.19.38.19.153 0 .279-.063.381-.19l6.599-8.16a.477.477 0 00.102-.305.518.518 0 00-.178-.382l-.33-.315z"/>
                          </svg>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-bg border-t border-gray-700/20">
            {previews.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {previews.map((p) => (
                  <div key={p.id} className="relative w-16 h-16 rounded-xl overflow-hidden border border-gray-700/40">
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(p.url)
                        setPreviews((prev) => prev.filter((x) => x.id !== p.id))
                      }}
                      className="absolute top-0 right-0 w-5 h-5 bg-black/60 text-white rounded-bl-lg flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="p-2.5 hover:bg-bg-hover rounded-xl transition-colors flex-shrink-0">
                <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />

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
                  <div
                    className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center sm:justify-center animate-fade-in"
                    onClick={() => setShowEmoji(false)}
                  >
                    <div
                      className="w-full sm:w-auto overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EmojiPicker
                        onEmojiClick={(emoji) => { setText((prev) => prev + emoji.emoji); setShowEmoji(false) }}
                        width={typeof window !== 'undefined' ? Math.min(320, window.innerWidth) : 320}
                        height={400}
                      />
                    </div>
                  </div>
                )}
              </div>

              <button onClick={() => sendMessage()} disabled={(!text.trim() && previews.length === 0) || sending}
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
                <div className="mt-6 pt-5 border-t border-gray-700/20 text-left">
                  <p className="text-xs text-text-muted font-medium uppercase mb-2">Проверка безопасности</p>
                  {chatFingerprint ? (
                    <>
                      <div className="text-2xl tracking-[0.2em] text-center mb-1">{chatFingerprint.join(' ')}</div>
                      <p className="text-[11px] text-text-muted text-center mb-3">
                        Сравните этот код с собеседником лично или по видео — у него отображается такой же.
                      </p>
                      {isVerified && (
                        <div className="flex items-center justify-center gap-1.5 text-success text-sm mb-2">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span>Проверенный контакт</span>
                        </div>
                      )}
                      {keyChanged && (
                        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-400 text-center mb-2">
                          Ключ собеседника изменился с момента проверки.
                          Возможно, он переустановил приложение, или аккаунт взломан. Перепроверьте код.
                        </div>
                      )}
                      <button
                        onClick={isVerified ? unverifyContact : verifyContact}
                        className={`w-full text-sm py-2.5 rounded-xl transition-colors ${
                          isVerified
                            ? 'bg-bg-hover text-text-secondary hover:text-danger'
                            : 'bg-primary text-white hover:bg-primary-hover'
                        }`}
                      >
                        {isVerified ? 'Снять отметку' : 'Подтвердить контакт'}
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-text-muted">Включите шифрование, чтобы проверить контакт.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full object-contain rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center"
            aria-label="Закрыть"
          >
            <title>Закрыть</title>
            ×
          </button>
        </div>
      )}
    </div>
  )
}
