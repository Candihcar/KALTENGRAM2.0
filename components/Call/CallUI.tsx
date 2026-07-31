'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { getPusherClient } from '@/lib/pusher-client'
import type { CallData } from './CallProvider'

interface SignalData {
  from: string
  type: 'offer' | 'answer' | 'candidate' | 'offer-request'
  sdp?: RTCSessionDescriptionInit | null
  candidate?: RTCIceCandidateInit | null
}

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export function CallUI({
  call,
  currentUserId,
  onEnd,
}: {
  call: CallData
  currentUserId: string
  onEnd: () => void
}) {
  const isCaller = call.callerId === currentUserId
  const otherUser = isCaller ? call.receiver : call.caller

  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [duration, setDuration] = useState(0)
  const [connected, setConnected] = useState(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<any>(null)
  const endedRef = useRef(false)
  const remoteDescRef = useRef(false)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])

  useEffect(() => {
    let disposed = false
    endedRef.current = false

    async function sendSignal(data: SignalData) {
      try {
        await fetch('/api/calls/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: call.id, data }),
        })
      } catch {}
    }

    async function updateStatus(status: string) {
      try {
        await fetch('/api/calls', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callId: call.id, status }),
        })
      } catch {}
    }

    function flushPending() {
      const peer = peerRef.current
      if (!peer) return
      while (pendingCandidatesRef.current.length) {
        const c = pendingCandidatesRef.current.shift()!
        peer.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
      }
    }

    function cleanup() {
      if (endedRef.current) return
      endedRef.current = true
      if (channelRef.current) {
        channelRef.current.unbind_all()
        channelRef.current = null
      }
      peerRef.current?.close()
      peerRef.current = null
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      onEnd()
    }

    async function handleSignal(data: SignalData) {
      if (data.from === currentUserId) return
      const peer = peerRef.current
      if (!peer) return

      if (data.type === 'offer-request') {
        if (isCaller) {
          if (peer.localDescription) {
            await sendSignal({
              from: currentUserId,
              type: 'offer',
              sdp: peer.localDescription,
            })
          } else {
            const offer = await peer.createOffer()
            await peer.setLocalDescription(offer)
            await sendSignal({ from: currentUserId, type: 'offer', sdp: offer })
          }
        }
        return
      }

      if (data.type === 'offer' && data.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(data.sdp))
        remoteDescRef.current = true
        flushPending()
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        await sendSignal({ from: currentUserId, type: 'answer', sdp: answer })
        return
      }

      if (data.type === 'answer' && data.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(data.sdp))
        remoteDescRef.current = true
        flushPending()
        return
      }

      if (data.type === 'candidate' && data.candidate) {
        if (!remoteDescRef.current) {
          pendingCandidatesRef.current.push(data.candidate)
        } else {
          try {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate))
          } catch {}
        }
      }
    }

    async function init() {
      const pusher = await getPusherClient()
      if (pusher) {
        const channel = pusher.subscribe(`call-${call.id}`)
        channelRef.current = channel
        channel.bind('call-signal', handleSignal)
        channel.bind('call-updated', ({ call: updated }: { call: CallData }) => {
          if (
            ['ENDED', 'DECLINED', 'MISSED'].includes(updated.status) &&
            !endedRef.current
          ) {
            toast(
              updated.status === 'DECLINED' ? 'Звонок отклонён' : 'Звонок завершён'
            )
            cleanup()
          }
        })
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        })
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (localVideoRef.current) localVideoRef.current.srcObject = stream

        const peer = new RTCPeerConnection(rtcConfig)
        peerRef.current = peer
        stream.getTracks().forEach((t) => peer.addTrack(t, stream))

        peer.onicecandidate = (e) => {
          if (e.candidate && remoteDescRef.current) {
            sendSignal({
              from: currentUserId,
              type: 'candidate',
              candidate: e.candidate.toJSON(),
            })
          }
        }

        peer.ontrack = (e) => {
          if (remoteVideoRef.current && e.streams[0]) {
            remoteVideoRef.current.srcObject = e.streams[0]
          }
        }

        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'connected') setConnected(true)
          if (
            (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') &&
            !endedRef.current
          ) {
            toast.error('Соединение потеряно')
            cleanup()
          }
        }

        await updateStatus('ONGOING')

        if (isCaller) {
          const offer = await peer.createOffer()
          await peer.setLocalDescription(offer)
          await sendSignal({ from: currentUserId, type: 'offer', sdp: offer })
        } else {
          await sendSignal({ from: currentUserId, type: 'offer-request' })
        }
      } catch {
        toast.error('Не удалось получить доступ к камере/микрофону')
        cleanup()
      }
    }

    init()

    const timer = setInterval(() => setDuration((d) => d + 1), 1000)

    return () => {
      disposed = true
      clearInterval(timer)
      endedRef.current = true
      if (channelRef.current) {
        channelRef.current.unbind_all()
        channelRef.current = null
      }
      peerRef.current?.close()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id])

  async function hangUp() {
    endedRef.current = true
    try {
      await fetch('/api/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: call.id, status: 'ENDED' }),
      })
    } catch {}
    if (channelRef.current) {
      channelRef.current.unbind_all()
      channelRef.current = null
    }
    peerRef.current?.close()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    onEnd()
  }

  function toggleMute() {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = isMuted
      })
      setIsMuted(!isMuted)
    }
  }

  function toggleVideo() {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = isVideoOff
      })
      setIsVideoOff(!isVideoOff)
    }
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {connected && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
              isVideoOff ? 'opacity-0' : 'opacity-100'
            }`}
          />
        )}

        <div className={`relative text-center ${connected ? '' : 'z-10'}`}>
          {otherUser.image ? (
            <img
              src={otherUser.image}
              alt=""
              className="w-28 h-28 rounded-full mx-auto mb-5 border-4 border-gray-700/50 shadow-xl"
            />
          ) : (
            <div className="w-28 h-28 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-4xl font-bold mx-auto mb-5 border-4 border-gray-700/50 shadow-xl">
              {otherUser.displayName[0]}
            </div>
          )}
          <h3 className="text-2xl font-semibold text-white">{otherUser.displayName}</h3>
          <p className="text-gray-400 mt-2">
            {connected ? (
              formatDuration(duration)
            ) : isCaller ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-2 h-2 bg-success rounded-full animate-pulse-dot" />
                Звонит...
              </span>
            ) : (
              'Подключение...'
            )}
          </p>
        </div>

        <div className="absolute top-5 right-5 w-44 h-60 bg-gray-800 rounded-2xl overflow-hidden border-2 border-gray-700/50 shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
          />
        </div>
      </div>

      <div className="py-8 flex items-center justify-center gap-6 bg-gradient-to-t from-gray-950/80 to-transparent">
        <button
          onClick={toggleMute}
          className={`p-4 rounded-2xl transition-all ${
            isMuted ? 'bg-danger text-white shadow-lg shadow-danger/30' : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isMuted ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            )}
          </svg>
        </button>

        <button
          onClick={hangUp}
          className="p-5 rounded-2xl bg-danger text-white hover:bg-red-600 transition-all shadow-lg shadow-danger/40"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>

        <button
          onClick={toggleVideo}
          className={`p-4 rounded-2xl transition-all ${
            isVideoOff ? 'bg-danger text-white shadow-lg shadow-danger/30' : 'bg-gray-800 text-white hover:bg-gray-700'
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
