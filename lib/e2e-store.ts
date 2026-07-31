import { e2eImportPrivate } from './e2e'

export interface E2EState {
  userId: string
  privJwk: JsonWebKey
  pubB64: string
  privKey: CryptoKey
}

let state: E2EState | null = null
let attempted = false
const listeners = new Set<() => void>()
const pubCache = new Map<string, string>()

function emit() {
  listeners.forEach((fn) => fn())
}

export function isE2EUnlocked(): boolean {
  return !!state
}

export function getE2EState(): E2EState | null {
  return state
}

export function subscribeE2E(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function clearE2E() {
  if (state) {
    try {
      sessionStorage.removeItem(`kg-e2e-${state.userId}`)
    } catch {}
  }
  state = null
  attempted = false
  emit()
}

export async function saveE2EKeys(userId: string, privJwk: JsonWebKey, pubB64: string) {
  const privKey = await e2eImportPrivate(privJwk)
  state = { userId, privJwk, pubB64, privKey }
  try {
    sessionStorage.setItem(`kg-e2e-${userId}`, JSON.stringify({ privJwk, pubB64 }))
  } catch {}
  emit()
}

export async function restoreE2E(userId: string): Promise<boolean> {
  if (state) return true
  attempted = true
  try {
    const raw = sessionStorage.getItem(`kg-e2e-${userId}`)
    if (!raw) return false
    const { privJwk, pubB64 } = JSON.parse(raw)
    if (!privJwk || !pubB64) return false
    await saveE2EKeys(userId, privJwk, pubB64)
    return true
  } catch {
    return false
  }
}

export async function getPubKeys(userIds: string[]): Promise<Map<string, string>> {
  const missing = userIds.filter((id) => !pubCache.has(id))
  if (missing.length) {
    try {
      const res = await fetch(`/api/e2e/keys?userIds=${encodeURIComponent(missing.join(','))}`)
      if (res.ok) {
        const m: Record<string, string> = await res.json()
        for (const [k, v] of Object.entries(m)) pubCache.set(k, v)
      }
    } catch {}
  }
  return pubCache
}

export async function fetchOwnE2E(): Promise<{ pub: string; salt: string; privEnc: string } | null> {
  const res = await fetch('/api/e2e/keys')
  if (!res.ok) return null
  const data = await res.json()
  if (!data.pub) return null
  return { pub: data.pub, salt: data.salt, privEnc: data.privEnc }
}
