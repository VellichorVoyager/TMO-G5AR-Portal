"use client"

import { useEffect, useState, useRef } from "react"
import { useTelemetryAll } from "@/hooks/use-router-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Volume2, VolumeX, Radar } from "lucide-react"

export default function PlacementPage() {
  const { data: telemetry } = useTelemetryAll()
  const [audioEnabled, setAudioEnabled] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const signal5g = telemetry?.cell?.["5g"]?.sector

  useEffect(() => {
    if (!audioEnabled || !signal5g?.rsrp) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = new AudioContext()
    }

    // Ensure audio context is running (some browsers suspend it)
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume()
    }

    const playBeep = () => {
      if (!audioCtxRef.current) return
      const oscillator = audioCtxRef.current.createOscillator()
      const gainNode = audioCtxRef.current.createGain()

      // Higher frequency for better (higher/less negative) RSRP
      // RSRP range: -120 (bad) to -80 (good)
      const mappedFreq = Math.max(400, Math.min(1000, 1000 - ((signal5g.rsrp + 80) * -15)))
      
      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(mappedFreq, audioCtxRef.current.currentTime)
      
      gainNode.gain.setValueAtTime(0.1, audioCtxRef.current.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.1)

      oscillator.connect(gainNode)
      gainNode.connect(audioCtxRef.current.destination)

      oscillator.start()
      oscillator.stop(audioCtxRef.current.currentTime + 0.1)
    }

    // Faster beep for better RSRP
    // -120 = 1000ms delay, -80 = 200ms delay
    const delay = Math.max(200, Math.min(1000, 200 + ((signal5g.rsrp + 80) * -20)))
    
    intervalRef.current = setInterval(playBeep, delay)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [audioEnabled, signal5g?.rsrp])

  const getRsrpColor = (val: number) => {
    if (val >= -80) return "text-green-500"
    if (val >= -90) return "text-lime-500"
    if (val >= -100) return "text-yellow-500"
    if (val >= -110) return "text-orange-500"
    return "text-red-500"
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pt-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Placement Helper</h1>
        <p className="text-muted-foreground mt-2">
          Use this tool while moving the gateway around your house. Turn on the audio beep so you don't have to look at the screen. The faster and higher the beep, the better the signal.
        </p>
      </div>

      <Card className="glass-card border-0 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
          <Radar className="w-64 h-64" />
        </div>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-xl font-medium">Live 5G Metrics</CardTitle>
          <div className="flex items-center space-x-2 bg-background/50 p-2 rounded-full px-4 border border-border/50 z-10">
            <Switch
              id="audio-mode"
              checked={audioEnabled}
              onCheckedChange={setAudioEnabled}
            />
            <Label htmlFor="audio-mode" className="cursor-pointer flex items-center gap-2">
              {audioEnabled ? <Volume2 className="w-4 h-4 text-green-500" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
              Sonar Audio
            </Label>
          </div>
        </CardHeader>
        <CardContent className="pt-6 relative z-10">
          {!signal5g ? (
            <div className="text-center py-12 text-muted-foreground animate-pulse">
              Waiting for 5G signal...
            </div>
          ) : (
            <div className="grid gap-8 text-center">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Primary Metric (RSRP)</p>
                <div className={`text-8xl font-black tracking-tighter ${getRsrpColor(signal5g.rsrp)}`}>
                  {signal5g.rsrp}
                </div>
                <p className="text-xl text-muted-foreground mt-2">dBm</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-8 border-t border-border/50">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Noise (SINR)</p>
                  <p className="text-4xl font-bold">{signal5g.sinr} <span className="text-lg font-normal text-muted-foreground">dB</span></p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Quality (RSRQ)</p>
                  <p className="text-4xl font-bold">{signal5g.rsrq} <span className="text-lg font-normal text-muted-foreground">dB</span></p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
