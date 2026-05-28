import { NextResponse } from "next/server"
import { ENABLE_WRITE_ACTIONS } from "@/lib/config"
import { getApConfig, setApConfig } from "@/lib/router-api"

export async function GET() {
  try {
    const data = await getApConfig()
    return NextResponse.json(data)
  } catch (error) {
    console.error("AP Config API error:", error)
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    return NextResponse.json(
      { error: "Failed to fetch AP config" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  if (!ENABLE_WRITE_ACTIONS) {
    return NextResponse.json(
      { error: "Write actions are disabled by configuration (ENABLE_WRITE_ACTIONS=false)" },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    await setApConfig(body)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("AP Config update error:", error)
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    return NextResponse.json(
      { error: "Failed to update AP config" },
      { status: 500 }
    )
  }
}
