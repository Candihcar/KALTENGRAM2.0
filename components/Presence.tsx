'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'

export function Presence() {
  const { data: session } = useSession()
  const userId = session?.user?.id

  useEffect(() => {
    if (!userId) return

    async function send(online: boolean) {
      try {
        await fetch('/api/users/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ online }),
          keepalive: true,
        })
      } catch {}
    }

    send(true)

    const interval = setInterval(() => {
      if (document.visibilityState !== 'hidden') send(true)
    }, 25_000)

    function goOffline() {
      send(false)
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') goOffline()
      else send(true)
    }

    window.addEventListener('beforeunload', goOffline)
    window.addEventListener('pagehide', goOffline)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', goOffline)
      window.removeEventListener('pagehide', goOffline)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      send(false)
    }
  }, [userId])

  return null
}
