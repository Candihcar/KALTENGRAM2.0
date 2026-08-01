'use client'

import { useEffect, useRef } from 'react'
import { playIncomingRing } from './tones'
import type { CallData } from './CallProvider'

export function IncomingCallModal({
  call,
  onAccept,
  onDecline,
}: {
  call: CallData
  onAccept: () => void
  onDecline: () => void
}) {
  const caller = call.caller
  const ringRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => {
    ringRef.current = playIncomingRing()
    return () => {
      ringRef.current?.stop()
      ringRef.current = null
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center">
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-gray-300">
        <span className="w-2 h-2 bg-success rounded-full animate-pulse-dot" />
        <span className="text-sm">Входящий звонок...</span>
      </div>

      {caller.image ? (
        <img src={caller.image} alt="" className="w-32 h-32 rounded-full object-cover border-4 border-gray-700/50 shadow-xl" />
      ) : (
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-5xl font-bold border-4 border-gray-700/50 shadow-xl">
          {caller.displayName[0]}
        </div>
      )}

      <h2 className="text-3xl font-semibold text-white mt-6">{caller.displayName}</h2>
      <p className="text-gray-400 mt-2">Звонок в KaltenGram</p>

      <div className="mt-12 flex items-center gap-10">
        <button
          onClick={onDecline}
          className="w-16 h-16 rounded-full bg-danger text-white hover:bg-red-600 transition-all flex items-center justify-center shadow-lg shadow-danger/40"
          title="Отклонить"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>

        <button
          onClick={onAccept}
          className="w-16 h-16 rounded-full bg-success text-white hover:bg-green-600 transition-all flex items-center justify-center shadow-lg shadow-success/40"
          title="Ответить"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
