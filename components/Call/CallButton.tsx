'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

interface CallData {
  id: string; chatId: string; callerId: string; receiverId: string; status: string
  caller: { id: string; displayName: string; image: string | null }
  receiver: { id: string; displayName: string; image: string | null }
}

export function CallButton({
  receiverId,
  onCall,
  type,
}: {
  receiverId: string
  onCall: (call: CallData) => void
  type: 'audio' | 'video'
}) {
  const [loading, setLoading] = useState(false)

  async function startCall() {
    setLoading(true)
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId }),
      })

      if (res.ok) {
        const call = await res.json()
        onCall(call)
        toast.success(type === 'audio' ? 'Аудиозвонок...' : 'Видеозвонок...')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Ошибка звонка')
      }
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={startCall}
      disabled={loading}
      className={`p-2 hover:bg-bg-hover rounded-lg transition-colors ${loading ? 'opacity-50' : ''}`}
      title={type === 'audio' ? 'Аудиозвонок' : 'Видеозвонок'}
    >
      {type === 'audio' ? (
        <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  )
}
