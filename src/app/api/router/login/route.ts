import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { loginRouter, RouterRequestError } from "@/lib/router-api"

const DEFAULT_ROUTER_IP = "192.168.12.1"

export async function POST(request: Request) {
  try {
    const { username, password, routerIp } = await request.json()
    const ip = routerIp || DEFAULT_ROUTER_IP

    const data = await loginRouter(username, password, ip)

    if (data.auth?.token) {
      const tokenMaxAge = data.auth.expiration - Math.floor(Date.now() / 1000)

      // Set auth cookie (secure only if actually using HTTPS)
      cookies().set("auth_token", data.auth.token, {
        httpOnly: true,
        secure: false, // Allow HTTP for local network access
        sameSite: "lax",
        maxAge: tokenMaxAge,
        path: "/",
      })

      // Store router IP in cookie for other API routes
      cookies().set("router_ip", ip, {
        httpOnly: true,
        secure: false, // Allow HTTP for local network access
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      })

      return NextResponse.json({ success: true })
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
