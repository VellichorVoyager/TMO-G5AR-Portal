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

// WAN exposure checks (Shodan integration).
// Phase 1 uses only the free, keyless InternetDB/CVEDB endpoints. The API key and
// scan flag are read here so the capabilities route can advertise readiness for the
// keyed Phase 2 features, but they are never required for Phase 1.
export const ENABLE_EXPOSURE_CHECKS = toBoolean(process.env.ENABLE_EXPOSURE_CHECKS, true)
// Optional manual override of the detected public/WAN IP (e.g. a static IP, or when
// server-side detection isn't meaningful). Never exposed to the browser.
export const EXPOSURE_PUBLIC_IP = process.env.EXPOSURE_PUBLIC_IP?.trim() || undefined
// Phase 2+ only — server-side, never NEXT_PUBLIC. Spends Shodan query credits.
export const SHODAN_API_KEY = process.env.SHODAN_API_KEY?.trim() || undefined
// Phase 2+ only — gates credit-spending on-demand scans, off by default.
export const ENABLE_SHODAN_SCAN = toBoolean(process.env.ENABLE_SHODAN_SCAN, false)
