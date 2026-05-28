import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { COOKIE_SAMESITE, COOKIE_SECURE } from "@/lib/config"
import { loginRouter, normalizeRouterHost, RouterRequestError } from "@/lib/router-api"

const DEFAULT_ROUTER_IP = "192.168.12.1"

export async function POST(request: Request) {
  try {
    const { username, password, routerIp } = await request.json()
    const ip = routerIp || DEFAULT_ROUTER_IP
    const normalizedRouterHost = normalizeRouterHost(ip)

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
        secure: COOKIE_SECURE,
        sameSite: COOKIE_SAMESITE,
        maxAge: tokenMaxAge,
        path: "/",
      })

      cookies().set("router_ip", normalizedRouterHost, {
        httpOnly: true,
        secure: COOKIE_SECURE,
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
      return NextResponse.json(
        { success: false, error: "Invalid router IP or hostname format" },
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
