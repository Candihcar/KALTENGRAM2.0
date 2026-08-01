'use client'

export interface ToneHandle {
  stop: () => void
}

function createCtx(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    return new Ctx()
  } catch {
    return null
  }
}

function ensureRunning(ctx: AudioContext, stopRef: { stopped: boolean }) {
  const resume = () => {
    if (stopRef.stopped) return
    ctx.resume().catch(() => {})
  }
  resume()
  window.addEventListener('pointerdown', resume)
  window.addEventListener('keydown', resume)
  return () => {
    window.removeEventListener('pointerdown', resume)
    window.removeEventListener('keydown', resume)
  }
}

function beep(ctx: AudioContext, master: GainNode, freq: number, start: number, dur: number, vol: number) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq

  const g = ctx.createGain()
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(vol, start + 0.05)
  g.gain.setValueAtTime(vol, start + dur - 0.05)
  g.gain.linearRampToValueAtTime(0, start + dur)

  osc.connect(g)
  g.connect(master)
  osc.start(start)
  osc.stop(start + dur)
  osc.onended = () => {
    try {
      osc.disconnect()
      g.disconnect()
    } catch {}
  }
}

// Ringback for caller: 425 Hz, 1s on / 4s off (Russian ringback)
export function playRingback(): ToneHandle | null {
  const ctx = createCtx()
  if (!ctx) return null

  let stopped = false
  let interval: ReturnType<typeof setInterval> | null = null
  const stopRef = { stopped: false }

  try {
    const master = ctx.createGain()
    master.gain.value = 0.08
    master.connect(ctx.destination)

    const removeListeners = ensureRunning(ctx, stopRef)

    const tone = () => {
      if (stopped) return
      beep(ctx, master, 425, ctx.currentTime, 1, 1)
    }
    tone()
    interval = setInterval(tone, 5000)

    return {
      stop: () => {
        stopped = true
        stopRef.stopped = true
        removeListeners()
        if (interval) clearInterval(interval)
        try {
          master.disconnect()
        } catch {}
        ctx.close().catch(() => {})
      },
    }
  } catch {
    ctx.close().catch(() => {})
    return null
  }
}

// Incoming ring for callee: 440 Hz double beep, repeated
export function playIncomingRing(): ToneHandle | null {
  const ctx = createCtx()
  if (!ctx) return null

  let stopped = false
  let interval: ReturnType<typeof setInterval> | null = null
  const stopRef = { stopped: false }

  try {
    const master = ctx.createGain()
    master.gain.value = 0.09
    master.connect(ctx.destination)

    const removeListeners = ensureRunning(ctx, stopRef)

    const ring = () => {
      if (stopped) return
      const t = ctx.currentTime
      beep(ctx, master, 440, t, 0.2, 1)
      beep(ctx, master, 440, t + 0.3, 0.2, 1)
    }
    ring()
    interval = setInterval(ring, 3000)

    return {
      stop: () => {
        stopped = true
        stopRef.stopped = true
        removeListeners()
        if (interval) clearInterval(interval)
        try {
          master.disconnect()
        } catch {}
        ctx.close().catch(() => {})
      },
    }
  } catch {
    ctx.close().catch(() => {})
    return null
  }
}
