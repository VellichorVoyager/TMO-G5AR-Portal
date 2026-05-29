import { NextResponse } from "next/server"
import { getGatewayInfo, getTelemetryAll, getApConfig } from "@/lib/router-api"

export async function GET() {
  try {
    const [gateway, telemetry, ap] = await Promise.all([
      getGatewayInfo(),
      getTelemetryAll(),
      getApConfig()
    ])

    // Sanitize AP Config (WiFi passwords)
    if (ap.ssids) {
      ap.ssids.forEach(ssid => {
        if (ssid.wpaKey) {
          ssid.wpaKey = "[REDACTED]"
        }
      })
    }

    // Sanitize SIM info (Phone Number, IMSI, IMEI)
    if (telemetry.sim) {
      if (telemetry.sim.msisdn) {
        telemetry.sim.msisdn = "[REDACTED]"
      }
      if (telemetry.sim.imsi) {
        telemetry.sim.imsi = "[REDACTED]"
      }
      if (telemetry.sim.imei) {
        telemetry.sim.imei = "[REDACTED]"
      }
      if (telemetry.sim.iccId) {
        telemetry.sim.iccId = "[REDACTED]"
      }
    }

    // Sanitize Clients (MACs)
    if (telemetry.clients) {
      Object.values(telemetry.clients).forEach((clientsList) => {
        if (Array.isArray(clientsList)) {
          clientsList.forEach((client: any) => {
            if (client.mac) client.mac = "[REDACTED]"
          })
        }
      })
    }
    
    // Sanitize Gateway info
    if (gateway.device) {
      if (gateway.device.macId) gateway.device.macId = "[REDACTED]"
      if (gateway.device.serial) gateway.device.serial = "[REDACTED]"
    }

    const payload = {
      timestamp: new Date().toISOString(),
      gateway,
      telemetry,
      ap,
    }

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Disposition": 'attachment; filename="gateway-diagnostics.json"',
        "Content-Type": "application/json"
      }
    })
  } catch (error) {
    console.error("Diagnostics export error:", error)
    if (error instanceof Error && error.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    return NextResponse.json(
      { error: "Failed to export diagnostics" },
      { status: 500 }
    )
  }
}
