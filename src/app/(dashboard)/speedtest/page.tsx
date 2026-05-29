"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ArrowDown, ArrowUp, Activity } from "lucide-react"

export default function SpeedTestPage() {
  const [testing, setTesting] = useState(false)
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null)
  const [uploadSpeed, setUploadSpeed] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState("Ready")

  const runTest = async () => {
    setTesting(true)
    setDownloadSpeed(null)
    setUploadSpeed(null)
    setProgress(0)

    try {
      // Download Test (25MB)
      setStatus("Testing Download...")
      const dlBytes = 25000000
      const dlStart = performance.now()
      
      // Add a cache buster parameter to prevent browser caching
      const dlRes = await fetch(`https://speed.cloudflare.com/__down?bytes=${dlBytes}&t=${Date.now()}`)
      await dlRes.arrayBuffer()
      const dlEnd = performance.now()
      
      const dlTimeSec = (dlEnd - dlStart) / 1000
      const dlBits = dlBytes * 8
      const dlMbps = dlBits / dlTimeSec / 1000000
      setDownloadSpeed(Number(dlMbps.toFixed(2)))
      setProgress(50)

      // Upload Test (10MB)
      setStatus("Testing Upload...")
      const ulBytes = 10000000
      const dummyData = new Uint8Array(ulBytes)
      // Fill with some data so it's not purely zero-filled (which some networks highly compress)
      for (let i = 0; i < dummyData.length; i += 65536) {
        crypto.getRandomValues(dummyData.subarray(i, Math.min(i + 65536, dummyData.length)))
      }
      
      const ulStart = performance.now()
      await fetch(`https://speed.cloudflare.com/__up?t=${Date.now()}`, {
        method: "POST",
        body: dummyData
      })
      const ulEnd = performance.now()

      const ulTimeSec = (ulEnd - ulStart) / 1000
      const ulBits = ulBytes * 8
      const ulMbps = ulBits / ulTimeSec / 1000000
      setUploadSpeed(Number(ulMbps.toFixed(2)))
      setProgress(100)
      setStatus("Test Complete")

    } catch (e) {
      console.error(e)
      setStatus("Error running test")
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pt-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Speed Test</h1>
        <p className="text-muted-foreground mt-2">
          Test your connection speed via Cloudflare Edge Network.
        </p>
      </div>

      <Card className="glass-card border-0">
        <CardContent className="p-8 text-center space-y-8">
          <div className="flex justify-center pt-4">
            <div className="h-24 w-24 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Activity className={`h-12 w-12 text-blue-500 ${testing ? 'animate-pulse' : ''}`} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 divide-x divide-border/50">
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <ArrowDown className="w-5 h-5 text-green-500" />
                <span className="font-medium uppercase tracking-wider text-sm">Download</span>
              </div>
              <div className="text-5xl font-black tracking-tighter">
                {downloadSpeed !== null ? downloadSpeed : "—"}
              </div>
              <div className="text-sm font-medium text-muted-foreground">Mbps</div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <ArrowUp className="w-5 h-5 text-blue-500" />
                <span className="font-medium uppercase tracking-wider text-sm">Upload</span>
              </div>
              <div className="text-5xl font-black tracking-tighter">
                {uploadSpeed !== null ? uploadSpeed : "—"}
              </div>
              <div className="text-sm font-medium text-muted-foreground">Mbps</div>
            </div>
          </div>

          <div className="space-y-4 max-w-md mx-auto pt-4">
            <div className="flex justify-between text-sm font-medium text-muted-foreground">
              <span>{status}</span>
              {testing && <span>{progress}%</span>}
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <Button 
            size="lg" 
            className="w-full max-w-xs rounded-full h-14 text-lg mt-4"
            disabled={testing}
            onClick={runTest}
          >
            {testing ? "Testing..." : downloadSpeed !== null ? "Test Again" : "Start Speed Test"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
