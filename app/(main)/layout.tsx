import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { CallProvider } from '@/components/Call/CallProvider'
import { Presence } from '@/components/Presence'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')
  return (
    <CallProvider>
      <Presence />
      {children}
    </CallProvider>
  )
}
