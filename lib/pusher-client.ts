import type Pusher from 'pusher-js'

let client: Pusher | null = null

export async function getPusherClient(): Promise<Pusher | null> {
  if (typeof window === 'undefined') return null
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!key || !cluster) return null
  if (!client) {
    const { default: Pusher } = await import('pusher-js')
    client = new Pusher(key, {
      cluster,
      forceTLS: true,
    })
  }
  return client
}
