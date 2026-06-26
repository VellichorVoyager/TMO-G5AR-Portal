import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { ENABLE_EXPOSURE_CHECKS, SHODAN_API_KEY } from "@/lib/config-server"
import { shodanHostLookup, ShodanApiError } from "@/lib/shodan"
import { isValidIpv4 } from "@/lib/router-host"
import { checkRateLimit, recordFailedLogin } from "@/lib/rate-limit"

// Host lookups spend a Shodan query credit each, so rate-limit them tightly.
const HOST_RATE_LIMIT = 5
const HOST_WINDOW_MS = 60 * 1000

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "local"
}

export async function GET(request: NextRequest) {
  if (!ENABLE_EXPOSURE_CHECKS) {
    return NextResponse.json({ error: "Exposure checks are disabled" }, { status: 403 })
  }
  if (!SHODAN_API_KEY) {
    return NextResponse.json({ error: "Shodan API key is not configured" }, { status: 400 })
  }

  const ip = request.nextUrl.searchParams.get("ip")?.trim()
  if (!ip || !isValidIpv4(ip)) {
    return NextResponse.json({ error: "A valid IPv4 address is required" }, { status: 400 })
  }

  const rateLimitKey = `exposure-host:${getClientIp(request)}`
  if (!checkRateLimit(rateLimitKey, HOST_RATE_LIMIT).success) {
    return NextResponse.json(
      { error: "Too many host lookups. Please wait a moment." },
      { status: 429 }
    )
  }
  recordFailedLogin(rateLimitKey, HOST_WINDOW_MS)

  try {
    const host = await shodanHostLookup(ip)
    if (!host) {
      return NextResponse.json({ found: false, ip, host: null })
    }
    return NextResponse.json({ found: true, ip, host })
  } catch (error) {
    const status = error instanceof ShodanApiError ? error.status ?? 502 : 502
    const message = error instanceof Error ? error.message : "Host lookup failed"
    return NextResponse.json({ error: message }, { status })
  }
}
