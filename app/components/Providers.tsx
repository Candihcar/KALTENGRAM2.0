'use client'

import { SessionProvider } from 'next-auth/react'
import { Toaster } from 'react-hot-toast'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#1E2D3D', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' },
          success: { iconTheme: { primary: '#43B581', secondary: '#fff' } },
          error: { iconTheme: { primary: '#E53935', secondary: '#fff' } },
        }}
      />
    </SessionProvider>
  )
}
