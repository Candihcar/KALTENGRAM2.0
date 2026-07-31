import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { enforceRateLimit } from '@/lib/rate-limit'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/api/auth/callback/credentials') {
    const limited = enforceRateLimit(request, 10, 60_000, 'login')
    if (limited) return limited
  }

  const response = NextResponse.next()
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  )
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
