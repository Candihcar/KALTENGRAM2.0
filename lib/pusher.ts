import PusherServer from 'pusher'

function getPusherServer(): PusherServer | null {
  const appId = process.env.PUSHER_APP_ID
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY
  const secret = process.env.PUSHER_SECRET
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
  if (!appId || !key || !secret || !cluster) return null
  return new PusherServer({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  })
}

export async function triggerPusher(channel: string, event: string, data: unknown) {
  const pusher = getPusherServer()
  if (!pusher) return
  try {
    await pusher.trigger(channel, event, data)
  } catch {}
}
