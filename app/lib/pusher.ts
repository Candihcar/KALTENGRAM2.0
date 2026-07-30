import PusherServer from 'pusher'

const pusherAppId = process.env.PUSHER_APP_ID!
const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY!
const pusherSecret = process.env.PUSHER_SECRET!
const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER!

export const pusherServer = new PusherServer({
  appId: pusherAppId,
  key: pusherKey,
  secret: pusherSecret,
  cluster: pusherCluster,
  useTLS: true,
})
