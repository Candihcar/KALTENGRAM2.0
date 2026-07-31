import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import toast from 'react-hot-toast'
import { getPusherClient } from '@/lib/pusher-client'
import { CallUI } from './CallUI'
import { IncomingCallModal } from './IncomingCallModal'

export interface CallData {
  id: string
  chatId: string
  callerId: string
  receiverId: string
  status: string
  caller: { id: string; displayName: string; image: string | null }
  receiver: { id: string; displayName: string; image: string | null }
}

interface CallContextValue {
  activeCall: CallData | null
  incomingCall: CallData | null
  startCall: (receiverId: string) => void
  answerCall: (accept: boolean) => void
  cancelActiveCall: () => void
}

const CallContext = createContext<CallContextValue | null>(null)

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used within CallProvider')
  return ctx
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const [activeCall, setActiveCall] = useState<CallData | null>(null)
  const [incomingCall, setIncomingCall] = useState<CallData | null>(null)
  const channelRef = useRef<any>(null)
  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) return
    let disposed = false

    getPusherClient().then((pusher) => {
      if (disposed || !pusher) return
      const channel = pusher.subscribe(`user-${userId}`)
      channelRef.current = channel
      channel.bind('incoming-call', (call: CallData) => {
        setIncomingCall(call)
      })
      channel.bind('call-cancelled', ({ callId }: { callId: string }) => {
        setIncomingCall((prev) => (prev && prev.id === callId ? null : prev))
      })
    })

    return () => {
      disposed = true
      if (channelRef.current) {
        channelRef.current.unbind_all()
        channelRef.current = null
      }
    }
  }, [userId])

  const startCall = useCallback(async (receiverId: string) => {
    const res = await fetch('/api/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiverId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      toast.error(data?.error || 'Ошибка звонка')
      return
    }
    const call: CallData = await res.json()
    setActiveCall(call)
    toast.success('Звонок...')
  }, [])

  const answerCall = useCallback(
    async (accept: boolean) => {
      if (!incomingCall) return
      if (accept) {
        setActiveCall(incomingCall)
        setIncomingCall(null)
      } else {
        try {
          await fetch('/api/calls', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callId: incomingCall.id, status: 'DECLINED' }),
          })
        } catch {}
        setIncomingCall(null)
      }
    },
    [incomingCall]
  )

  const cancelActiveCall = useCallback(() => {
    setActiveCall(null)
  }, [])

  return (
    <CallContext.Provider
      value={{ activeCall, incomingCall, startCall, answerCall, cancelActiveCall }}
    >
      {children}
      {incomingCall && (
        <IncomingCallModal
          call={incomingCall}
          onAccept={() => answerCall(true)}
          onDecline={() => answerCall(false)}
        />
      )}
      {activeCall && userId && (
        <CallUI call={activeCall} currentUserId={userId} onEnd={cancelActiveCall} />
      )}
    </CallContext.Provider>
  )
}
