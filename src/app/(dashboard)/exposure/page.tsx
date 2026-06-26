"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  RefreshCw,
  ExternalLink,
  Globe,
  Search,
  Radar,
  Bell,
  BellOff,
  Trash2,
  Plus,
} from "lucide-react"
import {
  useExposure,
  useRouterCapabilities,
  useShodanAlerts,
  useShodanTriggers,
} from "@/hooks/use-router-data"
import type { ShodanAlert, ShodanAlertTrigger } from "@/hooks/use-router-data"

interface ShodanService {
  port: number
  transport: string
  product?: string
  version?: string
  cpe?: string[]
  timestamp?: string
  vulns?: string[]
}

interface ShodanHostResult {
  ip: string
  ports: number[]
  hostnames: string[]
  org?: string
  isp?: string
  os?: string
  lastUpdate?: string
  services: ShodanService[]
  vulns: string[]
}

// Common service names for the ports most relevant to home-gateway exposure.
const PORT_LABELS: Record<number, string> = {
  21: "FTP",
  22: "SSH",
  23: "Telnet",
  53: "DNS",
  80: "HTTP",
  443: "HTTPS",
  445: "SMB",
  554: "RTSP",
  1900: "SSDP",
  3389: "RDP",
  5060: "SIP",
  5555: "ADB",
  7547: "TR-069",
  8080: "HTTP-alt",
  8443: "HTTPS-alt",
}

const sourceLabel: Record<string, string> = {
  manual: "manually entered",
  override: "server override (EXPOSURE_PUBLIC_IP)",
  detected: "detected from this server's connection",
}

// Shodan's recommended Monitor triggers. new_service fires on any newly-opened
// port; vulnerable on CVEs — together these cover "all vulnerable access ports".
const RECOMMENDED_TRIGGERS = [
  "new_service",
  "vulnerable",
  "malware",
  "open_database",
  "ssl_expired",
  "iot",
  "industrial_control_system",
  "internet_scanner",
]

export default function ExposurePage() {
  const { data: capabilities } = useRouterCapabilities()
  const [pendingIp, setPendingIp] = useState("")
  const [activeIp, setActiveIp] = useState<string | undefined>(undefined)
  const { data, error, isLoading, isValidating, mutate } = useExposure(activeIp)

  const exposureDisabled = capabilities?.exposureChecksEnabled === false
  const keyConfigured = capabilities?.shodanKeyConfigured === true
  const scanEnabled = capabilities?.shodanScanEnabled === true
  const monitorEnabled = capabilities?.shodanMonitorEnabled === true

  // Phase 3 — Monitor alerts (fetched on-demand when section is visible)
  const {
    data: alertsData,
    isLoading: alertsLoading,
    mutate: mutateAlerts,
  } = useShodanAlerts()
  const { data: triggersData } = useShodanTriggers()
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [triggerBusy, setTriggerBusy] = useState<string | null>(null) // trigger name being toggled

  // Deep inspection (keyed Shodan API) state — on-demand, spends credits.
  const [host, setHost] = useState<ShodanHostResult | null>(null)
  const [hostMsg, setHostMsg] = useState<string | null>(null)
  const [hostLoading, setHostLoading] = useState(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [scanBusy, setScanBusy] = useState(false)

  // Only meaningful for a confirmed public IP (checked === true means it was queried).
  const targetIp = data?.checked ? data.ip : null

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = pendingIp.trim()
    setActiveIp(trimmed || undefined)
    // New target → drop any prior deep-lookup results.
    setHost(null)
    setHostMsg(null)
    setScanMsg(null)
  }

  const runHostLookup = async () => {
    if (!targetIp) return
    setHostLoading(true)
    setHostMsg(null)
    try {
      const res = await fetch(`/api/router/exposure/host?ip=${encodeURIComponent(targetIp)}`)
      const json = await res.json()
      if (!res.ok) {
        setHostMsg(json.error ?? "Host lookup failed.")
        setHost(null)
      } else if (!json.found) {
        setHost(null)
        setHostMsg("Shodan has no detailed record for this IP.")
      } else {
        setHost(json.host as ShodanHostResult)
      }
    } catch {
      setHostMsg("Host lookup failed.")
    } finally {
      setHostLoading(false)
    }
  }

  const runScan = async () => {
    if (!targetIp) return
    if (
      !window.confirm(
        `Run an on-demand Shodan scan of ${targetIp}? This actively probes the IP and spends scan credits.`
      )
    ) {
      return
    }
    setScanBusy(true)
    setScanMsg("Submitting scan…")
    try {
      const res = await fetch("/api/router/exposure/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: targetIp }),
      })
      const json = await res.json()
      if (!res.ok) {
        setScanMsg(json.error ?? "Scan request failed.")
        setScanBusy(false)
        return
      }
      const scanId: string = json.id
      const credits = typeof json.creditsLeft === "number" ? ` (${json.creditsLeft} scan credits left)` : ""
      setScanMsg(`Scan queued${credits}. Shodan is scanning — this can take a few minutes…`)

      // Poll status up to ~3 minutes, then stop and let the user refresh manually.
      for (let i = 0; i < 18; i++) {
        await new Promise((r) => setTimeout(r, 10000))
        const statusRes = await fetch(`/api/router/exposure/scan?id=${encodeURIComponent(scanId)}`)
        const statusJson = await statusRes.json()
        if (statusRes.ok && statusJson.status === "DONE") {
          setScanMsg("Scan complete. Refreshing results…")
          await mutate()
          await runHostLookup()
          setScanBusy(false)
          return
        }
      }
      setScanMsg("Scan still processing. Use Re-check / Deep lookup again shortly.")
    } catch {
      setScanMsg("Scan request failed.")
    } finally {
      setScanBusy(false)
    }
  }

  const createAlert = async () => {
    if (!targetIp) return
    setAlertMsg("Creating alert…")
    try {
      const res = await fetch("/api/router/exposure/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: targetIp }),
      })
      const json = await res.json()
      if (!res.ok) { setAlertMsg(json.error ?? "Failed to create alert."); return }
      setAlertMsg(`Alert created (id: ${json.alert.id}). Enable triggers below.`)
      await mutateAlerts()
    } catch { setAlertMsg("Failed to create alert.") }
  }

  const deleteAlert = async (id: string) => {
    setAlertMsg("Deleting alert…")
    try {
      const res = await fetch(`/api/router/exposure/alerts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (!res.ok) { const j = await res.json(); setAlertMsg(j.error ?? "Delete failed."); return }
      setAlertMsg("Alert deleted.")
      await mutateAlerts()
    } catch { setAlertMsg("Delete failed.") }
  }

  const toggleTrigger = async (alert: ShodanAlert, trigger: ShodanAlertTrigger) => {
    const currently = alert.triggers.includes(trigger.name)
    setTriggerBusy(trigger.name)
    try {
      const res = await fetch("/api/router/exposure/alerts/triggers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: alert.id, trigger: trigger.name, enabled: !currently }),
      })
      const json = await res.json()
      if (!res.ok) { setAlertMsg(json.error ?? "Toggle failed."); return }
      await mutateAlerts()
    } catch { setAlertMsg("Toggle failed.") } finally { setTriggerBusy(null) }
  }

  // Turn on Shodan's recommended triggers in one click. new_service catches ANY
  // newly-opened port; vulnerable catches CVEs — together they monitor all
  // vulnerable/access ports on the public IP. Only enables triggers that exist
  // on the account and aren't already on.
  const enableRecommended = async (alert: ShodanAlert) => {
    const available = (triggersData?.triggers ?? []).map((t) => t.name)
    const toEnable = RECOMMENDED_TRIGGERS.filter(
      (name) => available.includes(name) && !alert.triggers.includes(name)
    )
    if (toEnable.length === 0) {
      setAlertMsg("All recommended triggers are already enabled.")
      return
    }
    setAlertMsg(`Enabling ${toEnable.length} recommended trigger(s)…`)
    setTriggerBusy("__recommended__")
    try {
      for (const trigger of toEnable) {
        const res = await fetch("/api/router/exposure/alerts/triggers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId: alert.id, trigger, enabled: true }),
        })
        if (!res.ok) {
          const json = await res.json()
          setAlertMsg(json.error ?? `Failed enabling ${trigger}.`)
          break
        }
      }
      await mutateAlerts()
      setAlertMsg("Recommended triggers enabled. You'll get email alerts on changes.")
    } catch {
      setAlertMsg("Failed to enable recommended triggers.")
    } finally {
      setTriggerBusy(null)
    }
  }

  const ports = data?.data?.ports ?? []
  const vulns = data?.data?.vulns ?? []
  const cpes = data?.data?.cpes ?? []
  const hostnames = data?.data?.hostnames ?? []
  const tags = data?.data?.tags ?? []

  // Result state → headline styling
  const isExposed = data?.found && ports.length > 0
  const isClean = data && !data.behindCgnat && data.checked && !isExposed
  const isCgnat = data?.behindCgnat

  return (
    <div className="space-y-6 max-w-4xl mx-auto pt-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Exposure</h1>
        <p className="text-muted-foreground mt-2">
          What the internet can see when it looks back at your gateway&apos;s public IP.
          Powered by Shodan&apos;s free InternetDB — no API key, no scans run against you.
        </p>
      </div>

      {exposureDisabled ? (
        <Card className="glass-card border-0">
          <CardContent className="p-8 text-center text-muted-foreground">
            Exposure checks are disabled. Set <code>ENABLE_EXPOSURE_CHECKS=true</code> to enable.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Controls */}
          <Card className="glass-card border-0">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-500" />
                Public IP check
              </CardTitle>
              <CardDescription>
                Leave blank to auto-detect your public IP, or enter a specific IPv4 address to check.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCheck} className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={pendingIp}
                  onChange={(e) => setPendingIp(e.target.value)}
                  placeholder="Auto-detect (or enter an IPv4 address)"
                  inputMode="numeric"
                  className="flex-1"
                />
                <div className="flex gap-2">
                  <Button type="submit" disabled={isValidating}>
                    Check
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => mutate()}
                    disabled={isValidating}
                    title="Re-run the check"
                  >
                    <RefreshCw className={`h-4 w-4 ${isValidating ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Result */}
          {isLoading ? (
            <Card className="glass-card border-0">
              <CardContent className="p-6 space-y-3">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="glass-card border-0">
              <CardContent className="p-6 text-destructive">
                Couldn&apos;t run the exposure check. Please try again.
              </CardContent>
            </Card>
          ) : data ? (
            <>
              {/* Headline status */}
              <Card className="glass-card border-0">
                <CardContent className="p-6 flex items-start gap-4">
                  {isExposed ? (
                    <ShieldAlert className="h-10 w-10 text-yellow-500 flex-shrink-0" />
                  ) : isClean || isCgnat ? (
                    <ShieldCheck className="h-10 w-10 text-green-500 flex-shrink-0" />
                  ) : (
                    <ShieldQuestion className="h-10 w-10 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-semibold">
                        {isExposed
                          ? "Exposed ports detected"
                          : isCgnat
                            ? "Behind CGNAT — not internet-reachable"
                            : isClean
                              ? "No exposure detected"
                              : "Nothing to check"}
                      </span>
                      {data.ip && (
                        <Badge variant="outline" className="font-mono">
                          {data.ip}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{data.message}</p>
                    {data.source && (
                      <p className="text-xs text-muted-foreground">
                        IP source: {sourceLabel[data.source] ?? data.source}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Vulnerabilities */}
              {vulns.length > 0 && (
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-lg text-destructive">
                      Known vulnerabilities ({vulns.length})
                    </CardTitle>
                    <CardDescription>
                      CVEs Shodan associates with services seen on this IP. Review and patch.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {vulns.map((cve) => (
                      <a
                        key={cve}
                        href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Badge variant="destructive" className="font-mono gap-1">
                          {cve}
                          <ExternalLink className="h-3 w-3" />
                        </Badge>
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Open ports */}
              {isExposed && (
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-lg">Open ports ({ports.length})</CardTitle>
                    <CardDescription>
                      Services Shodan has observed listening on your public IP.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {ports.map((port) => (
                      <a
                        key={port}
                        href={`https://www.shodan.io/host/${data.ip}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Badge variant="warning" className="gap-1">
                          {port}
                          {PORT_LABELS[port] ? ` · ${PORT_LABELS[port]}` : ""}
                          <ExternalLink className="h-3 w-3" />
                        </Badge>
                      </a>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Detail (hostnames / CPEs / tags) */}
              {(hostnames.length > 0 || cpes.length > 0 || tags.length > 0) && (
                <Card className="glass-card border-0">
                  <CardHeader>
                    <CardTitle className="text-lg">Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    {hostnames.length > 0 && (
                      <div>
                        <div className="font-medium mb-1">Hostnames</div>
                        <div className="flex flex-wrap gap-2">
                          {hostnames.map((h) => (
                            <Badge key={h} variant="secondary" className="font-mono">
                              {h}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {cpes.length > 0 && (
                      <div>
                        <div className="font-medium mb-1">Detected software (CPEs)</div>
                        <div className="flex flex-wrap gap-2">
                          {cpes.map((c) => (
                            <Badge key={c} variant="outline" className="font-mono text-xs">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {tags.length > 0 && (
                      <div>
                        <div className="font-medium mb-1">Tags</div>
                        <div className="flex flex-wrap gap-2">
                          {tags.map((t) => (
                            <Badge key={t} variant="secondary">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}

          {/* Deep inspection — keyed Shodan API (spends credits) */}
          {keyConfigured && targetIp && (
            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Search className="h-5 w-5 text-blue-500" />
                  Deep inspection
                  <Badge variant="secondary" className="text-xs">Shodan API</Badge>
                </CardTitle>
                <CardDescription>
                  Richer banners and an optional live scan for{" "}
                  <span className="font-mono">{targetIp}</span>. These use your Shodan
                  account and spend credits.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={runHostLookup} disabled={hostLoading} variant="outline">
                    <Search className={`h-4 w-4 mr-2 ${hostLoading ? "animate-pulse" : ""}`} />
                    {hostLoading ? "Looking up…" : "Deep lookup (1 credit)"}
                  </Button>
                  {scanEnabled && (
                    <Button onClick={runScan} disabled={scanBusy} variant="outline">
                      <Radar className={`h-4 w-4 mr-2 ${scanBusy ? "animate-spin" : ""}`} />
                      {scanBusy ? "Scanning…" : "Run live scan"}
                    </Button>
                  )}
                </div>

                {scanMsg && <p className="text-sm text-muted-foreground">{scanMsg}</p>}
                {hostMsg && <p className="text-sm text-muted-foreground">{hostMsg}</p>}

                {host && (
                  <div className="space-y-4 text-sm">
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                      {host.org && <span><span className="font-medium text-foreground">Org:</span> {host.org}</span>}
                      {host.isp && <span><span className="font-medium text-foreground">ISP:</span> {host.isp}</span>}
                      {host.os && <span><span className="font-medium text-foreground">OS:</span> {host.os}</span>}
                      {host.lastUpdate && (
                        <span><span className="font-medium text-foreground">Last seen:</span> {new Date(host.lastUpdate).toLocaleString()}</span>
                      )}
                    </div>

                    {host.services.length > 0 && (
                      <div className="space-y-2">
                        <div className="font-medium">Services</div>
                        <div className="space-y-2">
                          {host.services.map((svc) => (
                            <div
                              key={`${svc.port}/${svc.transport}`}
                              className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 px-3 py-2"
                            >
                              <Badge variant="warning">{svc.port}/{svc.transport}</Badge>
                              <span className="font-medium">
                                {svc.product || "Unknown service"}
                                {svc.version ? ` ${svc.version}` : ""}
                              </span>
                              {svc.vulns && svc.vulns.length > 0 && (
                                <Badge variant="destructive" className="text-xs">
                                  {svc.vulns.length} CVE{svc.vulns.length === 1 ? "" : "s"}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Phase 3 — Shodan Monitor */}
          {monitorEnabled && keyConfigured && (
            <Card className="glass-card border-0">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bell className="h-5 w-5 text-purple-500" />
                  Monitor alerts
                  <Badge variant="secondary" className="text-xs">Shodan Monitor</Badge>
                </CardTitle>
                <CardDescription>
                  Persistent alerts that notify you when Shodan observes new ports,
                  vulnerabilities, or other changes on your public IP.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Create alert for current target */}
                {targetIp && (
                  <div className="flex items-center gap-3">
                    <Button onClick={createAlert} variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Monitor {targetIp}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Creates a /32 alert on your Shodan account for this IP.
                    </span>
                  </div>
                )}

                {alertMsg && (
                  <p className="text-sm text-muted-foreground">{alertMsg}</p>
                )}

                {/* Alert list */}
                {alertsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-64" />
                    <Skeleton className="h-5 w-48" />
                  </div>
                ) : alertsData?.alerts && alertsData.alerts.length > 0 ? (
                  <div className="space-y-4">
                    {alertsData.alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="rounded-md border border-border/50 p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="font-medium text-sm">{alert.name}</div>
                            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                              {alert.filters.ip.map((cidr) => (
                                <span key={cidr} className="font-mono">{cidr}</span>
                              ))}
                              <span>·</span>
                              <span>created {new Date(alert.created).toLocaleDateString()}</span>
                              {alert.expires > 0 && (
                                <>
                                  <span>·</span>
                                  <span>expires {new Date(alert.expires * 1000).toLocaleDateString()}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                            onClick={() => deleteAlert(alert.id)}
                            title="Delete alert"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Trigger toggles */}
                        {triggersData?.triggers && triggersData.triggers.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Triggers
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => enableRecommended(alert)}
                                disabled={triggerBusy === "__recommended__"}
                                title="Enable Shodan's recommended triggers (new ports, vulns, malware, etc.)"
                              >
                                <Bell className="h-3 w-3 mr-1.5" />
                                Enable recommended
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {triggersData.triggers.map((t) => {
                                const active = alert.triggers.includes(t.name)
                                const busy = triggerBusy === t.name
                                return (
                                  <button
                                    key={t.name}
                                    onClick={() => toggleTrigger(alert, t)}
                                    disabled={busy}
                                    title={t.description}
                                    className="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50"
                                    style={{
                                      borderColor: active ? "rgb(168 85 247 / 0.6)" : undefined,
                                      backgroundColor: active ? "rgb(168 85 247 / 0.1)" : undefined,
                                      color: active ? "rgb(168 85 247)" : undefined,
                                    }}
                                  >
                                    {active ? (
                                      <Bell className="h-3 w-3" />
                                    ) : (
                                      <BellOff className="h-3 w-3 opacity-50" />
                                    )}
                                    {t.name}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : alertsData ? (
                  <p className="text-sm text-muted-foreground">
                    No Monitor alerts yet. Click &ldquo;Monitor&rdquo; above to create one for this IP.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground px-1">
            Note: Shodan can only see public IPs. LAN devices (e.g. a headset on
            192.168.x.x) are never visible here — scan those locally with a tool like nmap.
          </p>
        </>
      )}
    </div>
  )
}
