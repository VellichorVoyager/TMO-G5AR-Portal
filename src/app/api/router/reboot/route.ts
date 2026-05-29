import { NextResponse } from "next/server"
import { ENABLE_WRITE_ACTIONS } from "@/lib/config-server"
import { rebootGateway } from "@/lib/router-api"
import { logAuditAction } from "@/lib/audit-logger"

export async function POST(request: Request) {
  if (!ENABLE_WRITE_ACTIONS) {
    return NextResponse.json(
      { error: "Write actions are disabled by configuration (ENABLE_WRITE_ACTIONS=false)" },
      { status: 403 }
    )
  }

  try {
    await rebootGateway()
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")
    await logAuditAction("REBOOT_GATEWAY", ip)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Reboot API error:", error)
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    return NextResponse.json(
      { error: "Failed to reboot gateway" },
      { status: 500 }
    )
  }
}
