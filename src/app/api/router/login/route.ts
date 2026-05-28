import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { COOKIE_SAMESITE, EFFECTIVE_COOKIE_SECURE } from "@/lib/config"
import { loginRouter, normalizeRouterHost, RouterRequestError } from "@/lib/router-api"

const DEFAULT_ROUTER_HOST = "192.168.12.1"
const ROUTER_HOST_COOKIE = "router_ip"
const INVALID_ROUTER_HOST_FORMAT_ERROR = "Invalid router IP or hostname"
const INVALID_ROUTER_HOST_FORMAT_RESPONSE = "Invalid router IP or hostname format"
const ROUTER_HOST_POLICY_ERROR =
  "Router host is not allowed by the current gateway host policy"

export async function POST(request: Request) {
  try {
    const { username, password, routerHost } = await request.json()
    const requestedRouterHost = routerHost || DEFAULT_ROUTER_HOST
    const normalizedRouterHost = normalizeRouterHost(requestedRouterHost)

    const data = await loginRouter(username, password, normalizedRouterHost)

    if (data.auth?.token) {
      const expiration = Number(data.auth.expiration)
      const tokenMaxAge = expiration - Math.floor(Date.now() / 1000)
      if (!Number.isFinite(tokenMaxAge) || tokenMaxAge <= 0) {
        return NextResponse.json(
          { success: false, error: "Gateway returned an invalid or expired auth token" },
          { status: 502 }
        )
      }

      cookies().set("auth_token", data.auth.token, {
        httpOnly: true,
        secure: EFFECTIVE_COOKIE_SECURE,
        sameSite: COOKIE_SAMESITE,
        maxAge: tokenMaxAge,
        path: "/",
      })

      // Keep the legacy router_ip cookie name for compatibility with existing sessions.
      cookies().set(ROUTER_HOST_COOKIE, normalizedRouterHost, {
        httpOnly: true,
        secure: EFFECTIVE_COOKIE_SECURE,
        sameSite: COOKIE_SAMESITE,
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      })

      return NextResponse.json({ success: true, routerHost: normalizedRouterHost })
    } else {
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
