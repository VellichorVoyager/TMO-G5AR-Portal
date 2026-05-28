import { NextResponse } from "next/server"
import { getVersion, getRouterHost } from "@/lib/router-api"

export async function GET() {
  const routerHost = getRouterHost()

  try {
    await getVersion({ routerHost })
    return NextResponse.json({ status: "online", host: routerHost })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    const isTimeout = errorMessage.includes("timeout")

    return NextResponse.json({
      status: "offline",
      host: routerHost,
      message: isTimeout ? "Connection timeout" : errorMessage,
    })
  }
}
