import { NextResponse } from "next/server"
import { ENABLE_WRITE_ACTIONS } from "@/lib/config-server"

export async function GET() {
  return NextResponse.json({ writeActionsEnabled: ENABLE_WRITE_ACTIONS })
}
