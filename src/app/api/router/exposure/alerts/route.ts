import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  ENABLE_EXPOSURE_CHECKS,
  ENABLE_SHODAN_MONITOR,
  SHODAN_API_KEY,
} from "@/lib/config-server"
import {
  shodanListAlerts,
  shodanCreateAlert,
  shodanDeleteAlert,
  ShodanApiError,
} from "@/lib/shodan"
import { isValidIpv4 } from "@/lib/router-host"
import { checkRateLimit, recordFailedLogin } from "@/lib/rate-limit"
import { logAuditAction } from "@/lib/audit-logger"

const ALERT_RATE_LIMIT = 10
const ALERT_WINDOW_MS = 60 * 1000

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

/** List all Monitor alerts on the account. */
export async function GET(request: NextRequest) {
  const blocked = preflight()
  if (blocked) return blocked

  const clientIp = getClientIp(request)
  if (!checkRateLimit(`alerts-get:${clientIp}`, ALERT_RATE_LIMIT).success) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }
  recordFailedLogin(`alerts-get:${clientIp}`, ALERT_WINDOW_MS)

  try {
    const alerts = await shodanListAlerts()
    return NextResponse.json({ alerts })
  } catch (error) {
    const status = error instanceof ShodanApiError ? error.status ?? 502 : 502
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list alerts" },
      { status }
    )
  }
}

/** Create a Monitor alert for a public IP. Audit-logged. */
export async function POST(request: NextRequest) {
  const blocked = preflight()
  if (blocked) return blocked

  const clientIp = getClientIp(request)
  if (!checkRateLimit(`alerts-post:${clientIp}`, 5).success) {
    return NextResponse.json({ error: "Too many alert creations." }, { status: 429 })
  }

  const body = (await request.json().catch(() => ({}))) as { ip?: string; name?: string }
  const ip = body.ip?.trim()
  const name = body.name?.trim() || `G5AR Portal — ${ip}`

  if (!ip || !isValidIpv4(ip)) {
    return NextResponse.json({ error: "A valid IPv4 address is required" }, { status: 400 })
  }

  recordFailedLogin(`alerts-post:${clientIp}`, ALERT_WINDOW_MS)

  try {
    const alert = await shodanCreateAlert(name, ip)
    await logAuditAction("shodan_monitor_create", clientIp, { ip, alertId: alert.id, name })
    return NextResponse.json({ alert })
  } catch (error) {
    const status = error instanceof ShodanApiError ? error.status ?? 502 : 502
    const message = error instanceof Error ? error.message : "Failed to create alert"
    await logAuditAction("shodan_monitor_create_failed", clientIp, { ip, error: message })
    return NextResponse.json({ error: message }, { status })
  }
}

/** Delete a Monitor alert by ID. Audit-logged. */
export async function DELETE(request: NextRequest) {
  const blocked = preflight()
  if (blocked) return blocked

  const clientIp = getClientIp(request)
  const id = request.nextUrl.searchParams.get("id")?.trim()
  if (!id) return NextResponse.json({ error: "Alert id is required" }, { status: 400 })

  try {
    await shodanDeleteAlert(id)
    await logAuditAction("shodan_monitor_delete", clientIp, { alertId: id })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const status = error instanceof ShodanApiError ? error.status ?? 502 : 502
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete alert" },
      { status }
    )
  }
}
