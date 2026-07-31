export const e2eTextEncoder = new TextEncoder()
export const e2eTextDecoder = new TextDecoder()

export interface WrappedKey {
  userId: string
  iv: string
  key: string
}

export interface EncryptedPayload {
  ciphertext: string
  nonce: string
}

export interface E2ESetup {
  pub: string
  salt: string
  privEnc: string
}

export function e2eBuf(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource
}

export function e2eRandomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n)
  crypto.getRandomValues(a)
  return a
}

export function e2eB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

export function e2eUnb64(str: string): Uint8Array {
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

export async function e2eDeriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', e2eBuf(e2eTextEncoder.encode(password)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: e2eBuf(salt), iterations: 150000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function e2eGenerateIdentity(): Promise<{ pubB64: string; privJwk: JsonWebKey }> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const pubRaw = await crypto.subtle.exportKey('raw', kp.publicKey)
  const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
  return { pubB64: e2eB64(new Uint8Array(pubRaw)), privJwk }
}

export async function e2eSetup(password: string): Promise<E2ESetup> {
  const salt = e2eRandomBytes(16)
  const { pubB64, privJwk } = await e2eGenerateIdentity()
  const key = await e2eDeriveKey(password, salt)
  const iv = e2eRandomBytes(12)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: e2eBuf(iv) },
    key,
    e2eBuf(e2eTextEncoder.encode(JSON.stringify(privJwk)))
  )
  const blob = new Uint8Array(iv.length + ct.byteLength)
  blob.set(iv, 0)
  blob.set(new Uint8Array(ct), iv.length)
  return { pub: pubB64, salt: e2eB64(salt), privEnc: e2eB64(blob) }
}

export async function e2eUnlock(password: string, saltB64: string, privEncB64: string): Promise<JsonWebKey> {
  const key = await e2eDeriveKey(password, e2eUnb64(saltB64))
  const blob = e2eUnb64(privEncB64)
  const iv = blob.slice(0, 12)
  const ct = blob.slice(12)
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: e2eBuf(iv) }, key, e2eBuf(ct))
    return JSON.parse(e2eTextDecoder.decode(pt))
  } catch {
    throw new Error('wrong-e2e-password')
  }
}

export async function e2eImportPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
}

export async function e2eImportPublic(pubB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', e2eBuf(e2eUnb64(pubB64)), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
}

async function e2eSharedKey(priv: CryptoKey, pub: CryptoKey): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256)
  const hkdfKey = await crypto.subtle.importKey('raw', e2eBuf(new Uint8Array(bits)), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: e2eBuf(new Uint8Array(16)),
      info: e2eBuf(e2eTextEncoder.encode('KaltenGram-E2E')),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function e2eNewMessageKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', e2eBuf(e2eRandomBytes(32)), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

export async function e2eWrapMessageKey(mk: CryptoKey, recipientPubB64: string, myPriv: CryptoKey): Promise<Omit<WrappedKey, 'userId'>> {
  const pub = await e2eImportPublic(recipientPubB64)
  const shared = await e2eSharedKey(myPriv, pub)
  const iv = e2eRandomBytes(12)
  const exported = await crypto.subtle.exportKey('raw', mk)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: e2eBuf(iv) }, shared, e2eBuf(new Uint8Array(exported)))
  return { iv: e2eB64(iv), key: e2eB64(new Uint8Array(ct)) }
}

export async function e2eUnwrapMessageKey(wrapped: Omit<WrappedKey, 'userId'>, senderPubB64: string, myPriv: CryptoKey): Promise<CryptoKey> {
  const pub = await e2eImportPublic(senderPubB64)
  const shared = await e2eSharedKey(myPriv, pub)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: e2eBuf(e2eUnb64(wrapped.iv)) },
    shared,
    e2eBuf(e2eUnb64(wrapped.key))
  )
  return crypto.subtle.importKey('raw', e2eBuf(new Uint8Array(pt)), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

export async function e2eEncryptText(text: string, mk: CryptoKey): Promise<EncryptedPayload> {
  const iv = e2eRandomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: e2eBuf(iv) }, mk, e2eBuf(e2eTextEncoder.encode(text)))
  return { ciphertext: e2eB64(new Uint8Array(ct)), nonce: e2eB64(iv) }
}

export async function e2eDecryptText(payload: EncryptedPayload, mk: CryptoKey): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: e2eBuf(e2eUnb64(payload.nonce)) },
    mk,
    e2eBuf(e2eUnb64(payload.ciphertext))
  )
  return e2eTextDecoder.decode(pt)
}

export async function e2eEncryptDataUrl(dataUrl: string, mk: CryptoKey): Promise<EncryptedPayload> {
  const iv = e2eRandomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: e2eBuf(iv) }, mk, e2eBuf(e2eTextEncoder.encode(dataUrl)))
  return { ciphertext: e2eB64(new Uint8Array(ct)), nonce: e2eB64(iv) }
}

export async function e2eDecryptDataUrl(payload: EncryptedPayload, mk: CryptoKey): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: e2eBuf(e2eUnb64(payload.nonce)) },
    mk,
    e2eBuf(e2eUnb64(payload.ciphertext))
  )
  return e2eTextDecoder.decode(pt)
}
