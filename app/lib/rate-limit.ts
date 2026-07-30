const rateMap = new Map<string, { count: number; resetTime: number }>()

export function rateLimit(key: string, limit: number, windowMs: number) {
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

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateMap.entries()) {
    if (now > entry.resetTime) rateMap.delete(key)
  }
}, 60000)
