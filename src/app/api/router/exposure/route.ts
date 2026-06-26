import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { ENABLE_EXPOSURE_CHECKS } from "@/lib/config-server"
import { checkExposure } from "@/lib/shodan"
import { checkRateLimit, recordFailedLogin } from "@/lib/rate-limit"

// Allow a handful of checks per window per client — InternetDB is free but should
// not be hammered, and the result rarely changes minute to minute.
const EXPOSURE_RATE_LIMIT = 10
const EXPOSURE_WINDOW_MS = 60 * 1000

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "local"
}

export async function GET(request: NextRequest) {
  if (!ENABLE_EXPOSURE_CHECKS) {
    return NextResponse.json(
      { error: "Exposure checks are disabled" },
      { status: 403 }
    )
  }

  const rateLimitKey = `exposure:${getClientIp(request)}`
  const limit = checkRateLimit(rateLimitKey, EXPOSURE_RATE_LIMIT)
  if (!limit.success) {
    return NextResponse.json(
      { error: "Too many exposure checks. Please wait a moment and try again." },
      { status: 429 }
    )
  }
  recordFailedLogin(rateLimitKey, EXPOSURE_WINDOW_MS)

  const manualIp = request.nextUrl.searchParams.get("ip")?.trim() || undefined
  const result = await checkExposure(manualIp)
  return NextResponse.json(result)
}
