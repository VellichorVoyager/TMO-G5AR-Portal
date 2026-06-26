import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  ENABLE_EXPOSURE_CHECKS,
  ENABLE_SHODAN_MONITOR,
  SHODAN_API_KEY,
} from "@/lib/config-server"
import {
  shodanListTriggers,
  shodanEnableTrigger,
  shodanDisableTrigger,
  ShodanApiError,
} from "@/lib/shodan"
import { checkRateLimit, recordFailedLogin } from "@/lib/rate-limit"
import { logAuditAction } from "@/lib/audit-logger"

const TRIGGER_RATE_LIMIT = 20
const TRIGGER_WINDOW_MS = 60 * 1000

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "local"
}

function preflight(): NextResponse | null {
  if (!ENABLE_EXPOSURE_CHECKS)
    return NextResponse.json({ error: "Exposure checks are disabled" }, { status: 403 })
  if (!SHODAN_API_KEY)
    return NextResponse.json({ error: "Shodan API key is not configured" }, { status: 400 })
  if (!ENABLE_SHODAN_MONITOR)
    return NextResponse.json(
      { error: "Shodan Monitor is disabled. Set ENABLE_SHODAN_MONITOR=true to enable." },
      { status: 403 }
    )
  return null
}

/** List all available trigger types. Cached-friendly — they rarely change. */
export async function GET(request: NextRequest) {
  const blocked = preflight()
  if (blocked) return blocked

  const clientIp = getClientIp(request)
  if (!checkRateLimit(`triggers-get:${clientIp}`, TRIGGER_RATE_LIMIT).success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }
  recordFailedLogin(`triggers-get:${clientIp}`, TRIGGER_WINDOW_MS)

  try {
    const triggers = await shodanListTriggers()
    return NextResponse.json({ triggers })
  } catch (error) {
    const status = error instanceof ShodanApiError ? error.status ?? 502 : 502
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list triggers" },
      { status }
    )
  }
}

/**
 * Toggle a trigger on an alert.
 * Body: { alertId, trigger, enabled: boolean }
 */
export async function POST(request: NextRequest) {
  const blocked = preflight()
  if (blocked) return blocked

  const clientIp = getClientIp(request)
  const body = (await request.json().catch(() => ({}))) as {
    alertId?: string
    trigger?: string
    enabled?: boolean
  }
  const { alertId, trigger, enabled } = body

  if (!alertId || !trigger || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "alertId, trigger, and enabled (boolean) are required" },
      { status: 400 }
    )
  }

  if (!checkRateLimit(`triggers-post:${clientIp}`, TRIGGER_RATE_LIMIT).success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }
  recordFailedLogin(`triggers-post:${clientIp}`, TRIGGER_WINDOW_MS)

  try {
    if (enabled) {
      await shodanEnableTrigger(alertId, trigger)
    } else {
      await shodanDisableTrigger(alertId, trigger)
    }
    await logAuditAction("shodan_trigger_toggle", clientIp, { alertId, trigger, enabled })
    return NextResponse.json({ ok: true, alertId, trigger, enabled })
  } catch (error) {
    const status = error instanceof ShodanApiError ? error.status ?? 502 : 502
    const message = error instanceof Error ? error.message : "Failed to toggle trigger"
    return NextResponse.json({ error: message }, { status })
  }
}
