// Simple in-memory rate limiter for a single Node.js process.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(ip: string | null, limit: number = 5) {
  const ipKey = ip || "unknown"
  const now = Date.now()
  const record = rateLimitMap.get(ipKey)

  if (record && record.resetTime > now && record.count >= limit) {
    return { success: false, resetTime: record.resetTime }
  }

  return { success: true }
}

export function recordFailedLogin(ip: string | null, windowMs: number = 5 * 60 * 1000) {
  const ipKey = ip || "unknown"
  const now = Date.now()
  const record = rateLimitMap.get(ipKey)

  if (!record || record.resetTime < now) {
    rateLimitMap.set(ipKey, { count: 1, resetTime: now + windowMs })
  } else {
    record.count++
  }
}

export function clearRateLimit(ip: string | null) {
  const ipKey = ip || "unknown"
  rateLimitMap.delete(ipKey)
}
