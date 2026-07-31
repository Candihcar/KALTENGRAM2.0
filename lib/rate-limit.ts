import { NextResponse } from 'next/server'

const rateMap = new Map<string, { count: number; resetTime: number }>()

function prune() {
  const now = Date.now()
  for (const [key, entry] of rateMap.entries()) {
    if (now > entry.resetTime) rateMap.delete(key)
  }
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  if (rateMap.size > 5000) prune()
  const now = Date.now()
  const entry = rateMap.get(key)
  if (!entry || now > entry.resetTime) {
    rateMap.set(key, { count: 1, resetTime: now + windowMs })
    return { success: true, remaining: limit - 1 }
  }
  if (entry.count >= limit) return { success: false, remaining: 0 }
  entry.count++
  return { success: true, remaining: limit - entry.count }
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0].trim()
    if (first) return first
  }
  const real = request.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}

export function enforceRateLimit(
  request: Request,
  limit: number,
  windowMs: number,
  label: string,
  key?: string
): NextResponse | null {
  const id = key || getClientIp(request)
  const result = rateLimit(`${label}:${id}`, limit, windowMs)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Слишком много запросов, попробуйте позже' },
      { status: 429 }
    )
  }
  return null
}
