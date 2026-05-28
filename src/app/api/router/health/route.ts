import { NextResponse } from "next/server"
import { getVersion, getRouterIp } from "@/lib/router-api"

export async function GET() {
  const routerIp = getRouterIp()

  try {
    await getVersion()
    return NextResponse.json({ status: "online", ip: routerIp })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const isTimeout = errorMessage.includes("timeout")

    return NextResponse.json({
      status: "offline",
      ip: routerIp,
      message: isTimeout ? "Connection timeout" : errorMessage,
    })
  }
}
