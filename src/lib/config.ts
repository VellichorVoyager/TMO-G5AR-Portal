const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export const toSameSite = (
  value: string | undefined,
  fallback: "strict" | "lax" | "none"
): "strict" | "lax" | "none" => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "strict" || normalized === "lax" || normalized === "none") {
    return normalized
  }
  return fallback
}

export const toEffectiveCookieSecure = (
  secure: boolean,
  sameSite: "strict" | "lax" | "none"
): boolean => secure || sameSite === "none"

export const toWriteActionsEnabled = (value: string | undefined, fallback: boolean): boolean =>
  toBoolean(value, fallback)

export const REQUEST_TIMEOUT_MS = toNumber(process.env.REQUEST_TIMEOUT_MS, 5000)

export const POLL_INTERVAL_FAST = toNumber(
  process.env.NEXT_PUBLIC_POLL_INTERVAL_FAST ?? process.env.POLL_INTERVAL_FAST,
  5000
)

export const POLL_INTERVAL_SLOW = toNumber(
  process.env.NEXT_PUBLIC_POLL_INTERVAL_SLOW ?? process.env.POLL_INTERVAL_SLOW,
  30000
)

export const COOKIE_SECURE = toBoolean(process.env.COOKIE_SECURE, false)
export const COOKIE_SAMESITE = toSameSite(process.env.COOKIE_SAMESITE, "strict")
export const EFFECTIVE_COOKIE_SECURE = toEffectiveCookieSecure(COOKIE_SECURE, COOKIE_SAMESITE)

if (COOKIE_SAMESITE === "none" && !COOKIE_SECURE) {
  console.warn("[config] COOKIE_SAMESITE=none requires Secure cookies; forcing Secure=true")
}

export const ALLOW_CUSTOM_GATEWAY_HOST = toBoolean(process.env.ALLOW_CUSTOM_GATEWAY_HOST, false)
export const GATEWAY_ALLOWED_HOSTS = process.env.GATEWAY_ALLOWED_HOSTS

export const NEXT_PUBLIC_REVALIDATE_ON_FOCUS = toBoolean(
  process.env.NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
  false
)

export const ENABLE_WRITE_ACTIONS = toWriteActionsEnabled(process.env.ENABLE_WRITE_ACTIONS, false)
