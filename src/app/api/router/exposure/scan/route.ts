import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { ENABLE_EXPOSURE_CHECKS, ENABLE_SHODAN_SCAN, SHODAN_API_KEY } from "@/lib/config-server"
import { shodanScan, shodanScanStatus, ShodanApiError } from "@/lib/shodan"
import { isValidIpv4 } from "@/lib/router-host"
import { checkRateLimit, recordFailedLogin } from "@/lib/rate-limit"
import { logAuditAction } from "@/lib/audit-logger"

// On-demand scans spend scan credits and actively probe an IP — keep them rare.
const SCAN_RATE_LIMIT = 3
const SCAN_WINDOW_MS = 5 * 60 * 1000

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "local"
}

function preflight(): NextResponse | null {
  if (!ENABLE_EXPOSURE_CHECKS) {
    return NextResponse.json({ error: "Exposure checks are disabled" }, { status: 403 })
  }
  if (!SHODAN_API_KEY) {
    return NextResponse.json({ error: "Shodan API key is not configured" }, { status: 400 })
  }
  return null
}

// Submit a new on-demand scan. Gated by ENABLE_SHODAN_SCAN and audit-logged.
export async function POST(request: NextRequest) {
  const blocked = preflight()
  if (blocked) return blocked

  if (!ENABLE_SHODAN_SCAN) {
    return NextResponse.json(
      { error: "On-demand scans are disabled. Set ENABLE_SHODAN_SCAN=true to enable." },
      { status: 403 }
    )
  }

  const clientIp = getClientIp(request)
  const rateLimitKey = `exposure-scan:${clientIp}`
  if (!checkRateLimit(rateLimitKey, SCAN_RATE_LIMIT).success) {
    return NextResponse.json(
      { error: "Scan limit reached. Please wait a few minutes." },
      { status: 429 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as { ip?: string }
  const ip = body.ip?.trim()
  if (!ip || !isValidIpv4(ip)) {
    return NextResponse.json({ error: "A valid IPv4 address is required" }, { status: 400 })
  }

  recordFailedLogin(rateLimitKey, SCAN_WINDOW_MS)

  try {
    const submission = await shodanScan(ip)
    await logAuditAction("shodan_scan", clientIp, {
      target: ip,
      scanId: submission.id,
      creditsLeft: submission.creditsLeft,
    })
    return NextResponse.json(submission)
  } catch (error) {
    const status = error instanceof ShodanApiError ? error.status ?? 502 : 502
    const message = error instanceof Error ? error.message : "Scan request failed"
    await logAuditAction("shodan_scan_failed", clientIp, { target: ip, error: message })
    return NextResponse.json({ error: message }, { status })
  }
}

// Poll the status of a previously submitted scan.
export async function GET(request: NextRequest) {
  const blocked = preflight()
  if (blocked) return blocked

  const id = request.nextUrl.searchParams.get("id")?.trim()
  if (!id) {
    return NextResponse.json({ error: "A scan id is required" }, { status: 400 })
  }

  try {
    const status = await shodanScanStatus(id)
    return NextResponse.json(status)
  } catch (error) {
    const httpStatus = error instanceof ShodanApiError ? error.status ?? 502 : 502
    const message = error instanceof Error ? error.message : "Scan status check failed"
    return NextResponse.json({ error: message }, { status: httpStatus })
  }
}
