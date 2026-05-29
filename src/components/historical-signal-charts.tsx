"use client"

import { useState, useEffect } from "react"
import { SignalChart } from "@/components/signal-chart"
import { TelemetryAll } from "@/lib/router-api"

interface DataPoint {
  time: string
  value: number
}

interface HistoricalData {
  rsrp: DataPoint[]
  rsrq: DataPoint[]
  sinr: DataPoint[]
}

const MAX_DATA_POINTS = 50

export function HistoricalSignalCharts({ telemetry }: { telemetry: TelemetryAll | undefined }) {
  const [history, setHistory] = useState<HistoricalData>({ rsrp: [], rsrq: [], sinr: [] })

  useEffect(() => {
    if (!telemetry?.cell?.["5g"]?.sector) return

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const sector = telemetry.cell["5g"].sector

    setHistory((prev) => {
      // Avoid duplicate consecutive entries if time happens to be exactly the same (unlikely but safe)
      if (prev.rsrp.length > 0 && prev.rsrp[prev.rsrp.length - 1].time === now) {
        return prev;
      }

      const newRsrp = [...prev.rsrp, { time: now, value: sector.rsrp }].slice(-MAX_DATA_POINTS)
      const newRsrq = [...prev.rsrq, { time: now, value: sector.rsrq }].slice(-MAX_DATA_POINTS)
      const newSinr = [...prev.sinr, { time: now, value: sector.sinr }].slice(-MAX_DATA_POINTS)

      return { rsrp: newRsrp, rsrq: newRsrq, sinr: newSinr }
    })
  }, [telemetry])

  if (history.rsrp.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        Gathering signal data history...
      </div>
    )
  }

  return (
    <div className="space-y-6 mt-8 pt-6 border-t border-border/50">
      <div className="space-y-2">
        <div className="flex justify-between">
          <h4 className="text-sm font-medium">RSRP Trend</h4>
          <span className="text-xs text-muted-foreground">Last {history.rsrp.length} updates</span>
        </div>
        <SignalChart data={history.rsrp} color="#22c55e" min={-140} max={-44} label="RSRP" unit="dBm" />
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-medium">RSRQ Trend</h4>
        <SignalChart data={history.rsrq} color="#eab308" min={-20} max={-3} label="RSRQ" unit="dB" />
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-medium">SINR Trend</h4>
        <SignalChart data={history.sinr} color="#3b82f6" min={-10} max={40} label="SINR" unit="dB" />
      </div>
    </div>
  )
}
