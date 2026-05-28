import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { COOKIE_SAMESITE, EFFECTIVE_COOKIE_SECURE } from "@/lib/config"

export async function POST() {
  // Clear auth cookies by setting them to expire immediately
  cookies().set("auth_token", "", {
    httpOnly: true,
    secure: EFFECTIVE_COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    maxAge: 0,
    path: "/",
  })

  cookies().set("router_ip", "", {
    httpOnly: true,
    secure: EFFECTIVE_COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    maxAge: 0,
    path: "/",
  })

  return NextResponse.json({ success: true })
}
