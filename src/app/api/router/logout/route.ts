import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { COOKIE_SAMESITE, EFFECTIVE_COOKIE_SECURE } from "@/lib/config-server"

export async function POST() {
  const cookieStore = await cookies()

  // Clear auth cookies by setting them to expire immediately
  cookieStore.set("auth_token", "", {
    httpOnly: true,
    secure: EFFECTIVE_COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    maxAge: 0,
    path: "/",
  })

  cookieStore.set("router_ip", "", {
    httpOnly: true,
    secure: EFFECTIVE_COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    maxAge: 0,
    path: "/",
  })

  return NextResponse.json({ success: true })
}
