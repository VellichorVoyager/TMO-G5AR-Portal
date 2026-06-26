import { NextResponse } from "next/server"
import {
  ENABLE_WRITE_ACTIONS,
  ENABLE_EXPOSURE_CHECKS,
  ENABLE_SHODAN_SCAN,
  ENABLE_SHODAN_MONITOR,
  SHODAN_API_KEY,
} from "@/lib/config-server"

export async function GET() {
  return NextResponse.json({
    writeActionsEnabled: ENABLE_WRITE_ACTIONS,
    exposureChecksEnabled: ENABLE_EXPOSURE_CHECKS,
    // Boolean only — the key itself is never sent to the browser.
    shodanKeyConfigured: Boolean(SHODAN_API_KEY),
    shodanScanEnabled: ENABLE_SHODAN_SCAN,
    shodanMonitorEnabled: ENABLE_SHODAN_MONITOR,
  })
}
