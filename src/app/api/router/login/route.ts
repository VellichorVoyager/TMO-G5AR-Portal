import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { COOKIE_SAMESITE, EFFECTIVE_COOKIE_SECURE } from "@/lib/config-server"
import { loginRouter, normalizeRouterHost, RouterRequestError } from "@/lib/router-api"
import { checkRateLimit, recordFailedLogin, clearRateLimit } from "@/lib/rate-limit"

const DEFAULT_ROUTER_HOST = "192.168.12.1"
const ROUTER_HOST_COOKIE = "router_ip"
const INVALID_ROUTER_HOST_FORMAT_ERROR = "Invalid router IP or hostname"
const INVALID_ROUTER_HOST_FORMAT_RESPONSE = "Invalid router IP or hostname format"
const ROUTER_HOST_POLICY_ERROR =
  "Router host is not allowed by the current gateway host policy"

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")
  const rateLimit = checkRateLimit(ip)

  if (!rateLimit.success && rateLimit.resetTime) {
    return NextResponse.json(
      { success: false, error: "Too many failed login attempts. Please try again later." },
      { 
        status: 429,
        headers: {
          "Retry-After": Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString()
        }
      }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 })
  }

  const { username, password, routerHost, routerIp } = body as {
    username?: unknown
    password?: unknown
    routerHost?: unknown
    routerIp?: unknown
  }

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username.trim() ||
    !password.trim()
  ) {
    return NextResponse.json(
      { success: false, error: "Username and password are required" },
      { status: 400 }
    )
  }

  const requestedRouterHost =
    typeof routerHost === "string" && routerHost.trim()
      ? routerHost
      : typeof routerIp === "string" && routerIp.trim()
        ? routerIp
        : DEFAULT_ROUTER_HOST

  try {
    const normalizedRouterHost = normalizeRouterHost(requestedRouterHost)

    const data = await loginRouter(username, password, normalizedRouterHost)

    if (data.auth?.token) {
      const cookieStore = await cookies()
      const expiration = Number(data.auth.expiration)
      const tokenMaxAge = expiration - Math.floor(Date.now() / 1000)
      if (!Number.isFinite(tokenMaxAge) || tokenMaxAge <= 0) {
        return NextResponse.json(
          { success: false, error: "Gateway returned an invalid or expired auth token" },
          { status: 502 }
        )
      }

      cookieStore.set("auth_token", data.auth.token, {
        httpOnly: true,
        secure: EFFECTIVE_COOKIE_SECURE,
        sameSite: COOKIE_SAMESITE,
        maxAge: tokenMaxAge,
        path: "/",
      })

      // Keep the legacy router_ip cookie name for compatibility with existing sessions.
      cookieStore.set(ROUTER_HOST_COOKIE, normalizedRouterHost, {
        httpOnly: true,
        secure: EFFECTIVE_COOKIE_SECURE,
        sameSite: COOKIE_SAMESITE,
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      })

      clearRateLimit(ip)

      return NextResponse.json({ success: true, routerHost: normalizedRouterHost })
    } else {
      recordFailedLogin(ip)
      return NextResponse.json(
        { success: false, error: data.result?.message || "Invalid credentials" },
        { status: 401 }
      )
    }
  } catch (error) {
    console.error("Login error:", error)
    if (error instanceof RouterRequestError && error.code === "INVALID_ROUTER_HOST") {
      const message =
        error.message === INVALID_ROUTER_HOST_FORMAT_ERROR
          ? INVALID_ROUTER_HOST_FORMAT_RESPONSE
          : ROUTER_HOST_POLICY_ERROR
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 }
      )
    }
    if (error instanceof RouterRequestError && error.status === 401) {
      recordFailedLogin(ip)
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { success: false, error: "Connection failed" },
      { status: 500 }
    )
  }
}
