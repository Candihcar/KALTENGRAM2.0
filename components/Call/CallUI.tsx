'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { getPusherClient } from '@/lib/pusher-client'
import { e2eBuf, e2eImportPublic } from '@/lib/e2e'
import { getE2EState, getPubKeys } from '@/lib/e2e-store'
import { playRingback } from './tones'
import type { CallData } from './CallProvider'

const EMOJI = [
  '🐶','🐱','🦊','🐼','🐨','🐯','🦁','🐸','🐵','🐷','🦄','🐬',
  '🐙','🦋','🐞','🐝','🦉','🦅','🦜','🐢','🐊','🦈','🐳','🦑',
  '🍎','🍋','🍉','🍇','🍓','🍒','🍑','🥝','🍍','🥥','🌽','🥕',
  '🌻','🌹','🌵','🎄','🍁','🍄','⭐','🌙','☀️','🌈','⚡','🔥',
  '💎','⚽','🏀','🎱','🎮','🎲','🎸','🎹','🚀','✈️','🚗','🏎️',
  '🍕','🍔','🍟','🌮','🍩','🍪','🧁','🍦',
]

interface SignalData {
  from: string
  type: 'offer' | 'answer' | 'candidate' | 'offer-request'
  sdp?: RTCSessionDescriptionInit | null
  candidate?: RTCIceCandidateInit | null
}

type Corner = 'tl' | 'tr' | 'bl' | 'br'

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

const CORNER_MARGIN = 12

function collectFingerprints(sdp: string): string[] {
  const fps: string[] = []
  const re = /a=fingerprint:[^ ]+ ([0-9A-Fa-f:]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(sdp))) fps.push(m[1].toLowerCase())
  return fps.sort()
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
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [duration, setDuration] = useState(0)
  const [connected, setConnected] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [previewPos, setPreviewPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [uiCollapsed, setUiCollapsed] = useState(false)
  const [verification, setVerification] = useState<'ok' | 'unavailable' | null>(null)
  const [phrase, setPhrase] = useState<string[]>([])
  const [showPhrase, setShowPhrase] = useState(false)
  const [isTouchDevice] = useState(
    () => typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
  )

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<any>(null)
  const endedRef = useRef(false)
  const remoteDescRef = useRef(false)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const dragStartRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ringbackRef = useRef<{ stop: () => void } | null>(null)

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
      if (ringbackRef.current) {
        ringbackRef.current.stop()
        ringbackRef.current = null
      }
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current)
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
        const channel = pusher.subscribe(`private-call-${call.id}`)
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
          if (e.streams[0]) setRemoteStream(e.streams[0])
        }

        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'connected') {
            setConnected(true)
            setJustConnected(true)
            if (ringbackRef.current) {
              ringbackRef.current.stop()
              ringbackRef.current = null
            }
            if (connectTimerRef.current) clearTimeout(connectTimerRef.current)
            connectTimerRef.current = setTimeout(() => setJustConnected(false), 2000)
          }
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
          ringbackRef.current = playRingback()
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
      if (ringbackRef.current) {
        ringbackRef.current.stop()
        ringbackRef.current = null
      }
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current)
      if (channelRef.current) {
        channelRef.current.unbind_all()
        channelRef.current = null
      }
      peerRef.current?.close()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  useEffect(() => {
    if (!connected) return
    setUiCollapsed(false)
    const t = setTimeout(() => setUiCollapsed(true), 3000)
    return () => clearTimeout(t)
  }, [connected])

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    async function compute() {
      const st = getE2EState()
      const peer = peerRef.current
      if (!st || !peer || !peer.localDescription?.sdp || !peer.remoteDescription?.sdp) {
        if (!cancelled) setVerification('unavailable')
        return
      }
      const localSdp = peer.localDescription.sdp
      const remoteSdp = peer.remoteDescription.sdp
      const pubs = await getPubKeys([otherUser.id])
      const peerPub = pubs.get(otherUser.id)
      if (!peerPub) {
        if (!cancelled) setVerification('unavailable')
        return
      }
      try {
        const peerKey = await e2eImportPublic(peerPub)
        const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerKey }, st.privKey, 256)
        const localFps = collectFingerprints(localSdp)
        const remoteFps = collectFingerprints(remoteSdp)
        const session = [...localFps, ...remoteFps].sort().join('|')
        const enc = new TextEncoder()
        const sessionBytes = enc.encode(`${session}|${call.id}`)
        const input = new Uint8Array(bits.byteLength + sessionBytes.length)
        input.set(new Uint8Array(bits), 0)
        input.set(sessionBytes, bits.byteLength)
        const digest = await crypto.subtle.digest('SHA-256', e2eBuf(input))
        const arr = new Uint8Array(digest)
        const words = [0, 1, 2, 3].map((i) => EMOJI[arr[i * 2] % EMOJI.length])
        if (cancelled) return
        setPhrase(words)
        setVerification('ok')
      } catch {
        if (!cancelled) setVerification('unavailable')
      }
    }
    compute()
    return () => {
      cancelled = true
    }
  }, [connected, otherUser.id, call.id])

  useEffect(
    () => () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
    },
    []
  )

  function toggleUi() {
    if (!connected) return
    setUiCollapsed(false)
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = setTimeout(() => setUiCollapsed(true), 4000)
  }

  function getPreviewSize() {
    return {
      w: previewRef.current?.offsetWidth ?? 112,
      h: previewRef.current?.offsetHeight ?? 160,
    }
  }

  function nearestCorner(): Corner {
    const container = containerRef.current
    if (!container) return 'tr'
    const { w, h } = getPreviewSize()
    const cx = previewPos.x + w / 2
    const cy = previewPos.y + h / 2
    const midX = container.clientWidth / 2
    const midY = container.clientHeight / 2
    return `${cx < midX ? 'l' : 'r'}${cy < midY ? 't' : 'b'}` as Corner
  }

  function snapToCorner(corner?: Corner) {
    const container = containerRef.current
    if (!container) return
    const { w, h } = getPreviewSize()
    const cw = container.clientWidth
    const ch = container.clientHeight
    const m = CORNER_MARGIN
    const target = corner ?? nearestCorner()
    const pos = {
      tl: { x: m, y: m },
      tr: { x: cw - w - m, y: m },
      bl: { x: m, y: ch - h - m },
      br: { x: cw - w - m, y: ch - h - m },
    }[target]
    setPreviewPos({ x: Math.max(0, pos.x), y: Math.max(0, pos.y) })
  }

  useEffect(() => {
    const apply = () => snapToCorner('tr')
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onPreviewPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    dragStartRef.current = { px: e.clientX, py: e.clientY, x: previewPos.x, y: previewPos.y }
    setDragging(true)
  }

  function onPreviewPointerMove(e: React.PointerEvent) {
    if (!dragStartRef.current) return
    const container = containerRef.current
    if (!container) return
    const { w, h } = getPreviewSize()
    const dx = e.clientX - dragStartRef.current.px
    const dy = e.clientY - dragStartRef.current.py
    const maxX = Math.max(0, container.clientWidth - w)
    const maxY = Math.max(0, container.clientHeight - h)
    setPreviewPos({
      x: Math.min(maxX, Math.max(0, dragStartRef.current.x + dx)),
      y: Math.min(maxY, Math.max(0, dragStartRef.current.y + dy)),
    })
  }

  function onPreviewPointerUp() {
    if (!dragStartRef.current) return
    dragStartRef.current = null
    setDragging(false)
    snapToCorner()
  }

  async function switchCamera() {
    const stream = streamRef.current
    if (!stream) return
    const next = facingMode === 'user' ? 'environment' : 'user'
    const peer = peerRef.current
    const sender = peer?.getSenders().find((s) => s.track?.kind === 'video')
    const wasOff = isVideoOff
    try {
      stream.getVideoTracks().forEach((t) => t.stop())

      let newTrack: MediaStreamTrack | null = null
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { exact: next } },
        })
        newTrack = newStream.getVideoTracks()[0]
      } catch {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: next },
        })
        newTrack = newStream.getVideoTracks()[0]
      }
      if (!newTrack) throw new Error('no track')

      stream.getVideoTracks().forEach((t) => stream.removeTrack(t))
      stream.addTrack(newTrack)
      newTrack.enabled = !wasOff

      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      if (sender) await sender.replaceTrack(newTrack)

      setFacingMode(next)
    } catch {
      toast.error('Не удалось переключить камеру')
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        })
        const restored = newStream.getVideoTracks()[0]
        if (restored) {
          stream.getVideoTracks().forEach((t) => stream.removeTrack(t))
          stream.addTrack(restored)
          restored.enabled = !wasOff
          if (localVideoRef.current) localVideoRef.current.srcObject = stream
          const s = peer?.getSenders().find((x) => x.track?.kind === 'video')
          if (s) await s.replaceTrack(restored)
        }
      } catch {}
    }
  }

  async function hangUp() {
    endedRef.current = true
    if (ringbackRef.current) {
      ringbackRef.current.stop()
      ringbackRef.current = null
    }
    if (connectTimerRef.current) clearTimeout(connectTimerRef.current)
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
      <div ref={containerRef} className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            connected ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {connected && (
          <button
            type="button"
            aria-label="Переключить интерфейс"
            onClick={toggleUi}
            className="absolute inset-0 z-10 cursor-default bg-transparent"
          />
        )}

        <div
          className={`absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-center transition-transform duration-500 ease-out px-4 ${
            connected && uiCollapsed ? '-translate-y-[40%]' : 'translate-y-0'
          }`}
        >
          <div
            className={`flex flex-col items-center text-center transition-all duration-500 ${
              connected && uiCollapsed ? 'opacity-50 scale-75' : 'opacity-100 scale-100'
            }`}
          >
            {otherUser.image ? (
              <img
                src={otherUser.image}
                alt=""
                className={`rounded-full border-4 border-gray-700/50 shadow-xl transition-all duration-500 ${
                  connected && uiCollapsed ? 'w-12 h-12 mb-1' : 'w-24 h-24 sm:w-28 sm:h-28 mb-4'
                }`}
              />
            ) : (
              <div
                className={`rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center border-4 border-gray-700/50 shadow-xl transition-all duration-500 ${
                  connected && uiCollapsed ? 'w-12 h-12 text-base mb-1' : 'w-24 h-24 sm:w-28 sm:h-28 text-4xl font-bold mb-4'
                }`}
              >
                {otherUser.displayName[0]}
              </div>
            )}
            <h3
              className={`font-semibold text-white transition-all duration-500 ${
                connected && uiCollapsed ? 'text-sm' : 'text-xl sm:text-2xl'
              }`}
            >
              {otherUser.displayName}
            </h3>
            <p
              className={`text-gray-400 transition-all duration-500 ${
                connected && uiCollapsed ? 'text-xs mt-0.5' : 'text-sm mt-2'
              }`}
            >
              {connected ? (
                justConnected ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 bg-success rounded-full animate-pulse-dot" />
                    Соединение...
                  </span>
                ) : (
                  formatDuration(duration)
                )
              ) : isCaller ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 bg-success rounded-full animate-pulse-dot" />
                  Звонок...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-2 h-2 bg-success rounded-full animate-pulse-dot" />
                  Соединение...
                </span>
              )}
            </p>
            {connected && (
              <div className="mt-2 flex flex-col items-center gap-1 pointer-events-auto">
                <div className="flex items-center gap-1.5 text-emerald-400 text-[11px]">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Звонок зашифрован</span>
                </div>
                {verification === 'ok' && (
                  <button
                    type="button"
                    onClick={() => setShowPhrase((v) => !v)}
                    className="text-[11px] text-emerald-300/80 hover:text-emerald-200 underline decoration-dotted"
                  >
                    {showPhrase ? 'Скрыть код проверки' : 'Проверить собеседника'}
                  </button>
                )}
                {verification === 'ok' && showPhrase && (
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="text-xl sm:text-2xl tracking-[0.15em]">{phrase.join(' ')}</div>
                    <span className="text-[10px] text-emerald-300/60">
                      Код новый в каждом звонке. Сравните с собеседником — если совпал, линия защищена от подмены
                    </span>
                  </div>
                )}
                {verification === 'unavailable' && (
                  <span className="text-[11px] text-amber-400/80">
                    Собеседник не настроил E2E — подлинность не проверена
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          ref={previewRef}
          onPointerDown={onPreviewPointerDown}
          onPointerMove={onPreviewPointerMove}
          onPointerUp={onPreviewPointerUp}
          onPointerCancel={onPreviewPointerUp}
          className={`absolute z-30 w-28 h-40 sm:w-44 sm:h-60 rounded-xl sm:rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl bg-gray-800 cursor-grab select-none touch-none ${
            dragging ? 'cursor-grabbing scale-105 shadow-2xl' : 'transition-all duration-200 ease-out'
          }`}
          style={{ left: previewPos.x, top: previewPos.y }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
          />
          {isVideoOff && (
            <div className="w-full h-full flex items-center justify-center text-white/70">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14" />
              </svg>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:pb-8 pt-2 flex items-center justify-center gap-4 sm:gap-7 bg-gradient-to-t from-gray-950/90 via-gray-950/60 to-transparent">
        <button
          onClick={toggleMute}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${
            isMuted ? 'bg-danger text-white shadow-lg shadow-danger/30' : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur'
          }`}
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isMuted ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            )}
          </svg>
        </button>

        {isTouchDevice && (
          <button
            onClick={switchCamera}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center bg-white/10 text-white hover:bg-white/20 backdrop-blur transition-all active:scale-95"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M20 9a8 8 0 00-14.93-3.5M4 15a8 8 0 0014.93 3.5" />
            </svg>
          </button>
        )}

        <button
          onClick={hangUp}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-danger text-white hover:bg-red-600 transition-all shadow-lg shadow-danger/40 active:scale-95 flex items-center justify-center"
        >
          <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>

        <button
          onClick={toggleVideo}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all active:scale-95 ${
            isVideoOff ? 'bg-danger text-white shadow-lg shadow-danger/30' : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur'
          }`}
        >
          <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isVideoOff ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            )}
          </svg>
        </button>
      </div>
    </div>
  )
}
