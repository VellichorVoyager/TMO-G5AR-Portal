import {
  toBoolean,
  toEffectiveCookieSecure,
  toNumber,
  toSameSite,
  toWriteActionsEnabled,
} from "@/lib/config-shared"

export const REQUEST_TIMEOUT_MS = toNumber(process.env.REQUEST_TIMEOUT_MS, 5000)

export const COOKIE_SECURE = toBoolean(process.env.COOKIE_SECURE, false)
export const COOKIE_SAMESITE = toSameSite(process.env.COOKIE_SAMESITE, "strict")
export const EFFECTIVE_COOKIE_SECURE = toEffectiveCookieSecure(COOKIE_SECURE, COOKIE_SAMESITE)

if (COOKIE_SAMESITE === "none" && !COOKIE_SECURE) {
  console.warn("[config] COOKIE_SAMESITE=none requires Secure cookies; forcing Secure=true")
}

export const ALLOW_CUSTOM_GATEWAY_HOST = toBoolean(process.env.ALLOW_CUSTOM_GATEWAY_HOST, false)
export const GATEWAY_ALLOWED_HOSTS = process.env.GATEWAY_ALLOWED_HOSTS

export const ENABLE_WRITE_ACTIONS = toWriteActionsEnabled(process.env.ENABLE_WRITE_ACTIONS, false)
