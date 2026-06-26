import { REQUEST_TIMEOUT_MS, EXPOSURE_PUBLIC_IP, SHODAN_API_KEY } from "@/lib/config-server"
import { isCgnatIpv4, isPublicIPv4, isValidIpv4 } from "@/lib/router-host"

// Phase 1 of the WAN exposure feature: free, keyless lookups only.
// InternetDB returns a cached snapshot of what Shodan has seen on a public IP —
// open ports, CPEs, hostnames, tags, and known CVEs — with no API key and no
// credits spent. See docs/shodan-exposure.md.
const INTERNETDB_BASE = "https://internetdb.shodan.io"
// Server-side egress IP detection. Only used when no manual/override IP is given.
const IP_ECHO_URL = "https://api.ipify.org?format=json"
// Phase 2: keyed Shodan REST API (spends credits). See docs/shodan-exposure.md.
const SHODAN_API_BASE = "https://api.shodan.io"

export type ExposureSource = "manual" | "override" | "detected"

export interface InternetDbResult {
  ip: string
  ports: number[]
  cpes: string[]
  hostnames: string[]
  tags: string[]
  vulns: string[]
}

export interface ExposureResult {
  /** The public IP that was (or would have been) checked; null if none could be resolved. */
  ip: string | null
  /** Where the IP came from. */
  source: ExposureSource | null
  /** True when the resolved address is in CGNAT space (not directly internet-reachable). */
  behindCgnat: boolean
  /** Whether InternetDB was actually queried (false for CGNAT / unresolved / non-public). */
  checked: boolean
  /** Whether InternetDB had a record for the IP (a 404 means "not seen exposed"). */
  found: boolean
  data: InternetDbResult | null
  /** Human-readable explanation of the result state. */
  message: string
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
  init: { method?: string; body?: BodyInit } = {}
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: init.method ?? "GET",
      body: init.body,
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Detect this server's public egress IP via a lightweight echo service.
 * Returns null on any failure (offline, timeout, malformed response).
 */
export async function detectPublicIp(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(IP_ECHO_URL)
    if (!res.ok) return null
    const data = (await res.json()) as { ip?: string }
    const ip = data.ip?.trim()
    return ip && isValidIpv4(ip) ? ip : null
  } catch {
    return null
  }
}

/**
 * Query Shodan's free InternetDB for an IP. Returns the record, or null when
 * InternetDB has no entry (HTTP 404 — i.e. nothing has been observed exposed).
 * Throws only on unexpected transport/HTTP errors.
 */
export async function queryInternetDb(ip: string): Promise<InternetDbResult | null> {
  const res = await fetchWithTimeout(`${INTERNETDB_BASE}/${ip}`)
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`InternetDB request failed: ${res.status}`)
  }
  const data = (await res.json()) as Partial<InternetDbResult>
  return {
    ip,
    ports: Array.isArray(data.ports) ? data.ports : [],
    cpes: Array.isArray(data.cpes) ? data.cpes : [],
    hostnames: Array.isArray(data.hostnames) ? data.hostnames : [],
    tags: Array.isArray(data.tags) ? data.tags : [],
    vulns: Array.isArray(data.vulns) ? data.vulns : [],
  }
}

/**
 * Resolve the public IP to check, in priority order:
 *   1. explicit manual IP (user-entered, validated)
 *   2. EXPOSURE_PUBLIC_IP server override
 *   3. server-side egress detection
 */
async function resolveTargetIp(
  manualIp?: string
): Promise<{ ip: string | null; source: ExposureSource | null }> {
  if (manualIp && isValidIpv4(manualIp)) {
    return { ip: manualIp, source: "manual" }
  }
  if (EXPOSURE_PUBLIC_IP && isValidIpv4(EXPOSURE_PUBLIC_IP)) {
    return { ip: EXPOSURE_PUBLIC_IP, source: "override" }
  }
  const detected = await detectPublicIp()
  return { ip: detected, source: detected ? "detected" : null }
}

/**
 * End-to-end exposure check: resolve the target public IP, classify it, and
 * (when it's a genuine public address) query InternetDB. Never throws for the
 * common states — CGNAT, unresolved, private, and "no record" all return a
 * populated ExposureResult with an explanatory message.
 */
export async function checkExposure(manualIp?: string): Promise<ExposureResult> {
  const { ip, source } = await resolveTargetIp(manualIp)

  if (!ip) {
    return {
      ip: null,
      source: null,
      behindCgnat: false,
      checked: false,
      found: false,
      data: null,
      message:
        "Couldn't determine a public IP to check. Enter one manually or set EXPOSURE_PUBLIC_IP.",
    }
  }

  if (isCgnatIpv4(ip)) {
    return {
      ip,
      source,
      behindCgnat: true,
      checked: false,
      found: false,
      data: null,
      message:
        "This address is in carrier-grade NAT (CGNAT) space — your gateway isn't directly reachable from the internet. That's good for exposure.",
    }
  }

  if (!isPublicIPv4(ip)) {
    return {
      ip,
      source,
      behindCgnat: false,
      checked: false,
      found: false,
      data: null,
      message:
        "That address isn't a public, internet-routable IP, so there's nothing for Shodan to see.",
    }
  }

  try {
    const data = await queryInternetDb(ip)
    if (!data) {
      return {
        ip,
        source,
        behindCgnat: false,
        checked: true,
        found: false,
        data: null,
        message: "No exposure record — Shodan hasn't observed any open ports on this IP.",
      }
    }
    const portCount = data.ports.length
    return {
      ip,
      source,
      behindCgnat: false,
      checked: true,
      found: true,
      data,
      message:
        portCount > 0
          ? `Shodan sees ${portCount} open port${portCount === 1 ? "" : "s"} on this IP.`
          : "Shodan has a record for this IP but lists no open ports.",
    }
  } catch (error) {
    return {
      ip,
      source,
      behindCgnat: false,
      checked: false,
      found: false,
      data: null,
      message: error instanceof Error ? error.message : "Exposure check failed.",
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — keyed Shodan REST API (host lookup + on-demand scan).
// These spend credits and require SHODAN_API_KEY. The route layer enforces the
// ENABLE_SHODAN_SCAN flag and audit-logs scans; this layer only talks to Shodan.
// ---------------------------------------------------------------------------

export class ShodanApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = "ShodanApiError"
    this.status = status
  }
}

export function isShodanKeyConfigured(): boolean {
  return Boolean(SHODAN_API_KEY)
}

function requireKey(): string {
  if (!SHODAN_API_KEY) {
    throw new ShodanApiError("Shodan API key is not configured", 401)
  }
  return SHODAN_API_KEY
}

/** Map a non-OK Shodan response to a friendly, non-leaking error. */
async function shodanError(res: Response): Promise<ShodanApiError> {
  let detail = ""
  try {
    const body = (await res.json()) as { error?: string }
    detail = body.error ?? ""
  } catch {
    // ignore non-JSON bodies
  }
  if (res.status === 401) return new ShodanApiError("Invalid or missing Shodan API key", 401)
  if (res.status === 403) {
    return new ShodanApiError(detail || "Shodan denied the request (no credits or access)", 403)
  }
  if (res.status === 429) return new ShodanApiError("Shodan rate limit reached — slow down", 429)
  return new ShodanApiError(detail || `Shodan request failed: ${res.status}`, res.status)
}

export interface ShodanService {
  port: number
  transport: string
  product?: string
  version?: string
  cpe?: string[]
  timestamp?: string
  vulns?: string[]
}

export interface ShodanHostResult {
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

/**
 * Rich host lookup via `/shodan/host/{ip}`. Spends 1 query credit.
 * Returns null when Shodan has no information for the IP (HTTP 404).
 */
export async function shodanHostLookup(ip: string): Promise<ShodanHostResult | null> {
  const key = requireKey()
  if (!isPublicIPv4(ip)) {
    throw new ShodanApiError("Host lookups are only valid for public IPs", 400)
  }
  const res = await fetchWithTimeout(
    `${SHODAN_API_BASE}/shodan/host/${ip}?key=${encodeURIComponent(key)}&minify=false`
  )
  if (res.status === 404) return null
  if (!res.ok) throw await shodanError(res)

  const raw = (await res.json()) as {
    ip_str?: string
    ports?: number[]
    hostnames?: string[]
    org?: string
    isp?: string
    os?: string | null
    last_update?: string
    vulns?: string[]
    data?: Array<{
      port?: number
      transport?: string
      product?: string
      version?: string
      cpe?: string[]
      timestamp?: string
      vulns?: Record<string, unknown> | string[]
    }>
  }

  const services: ShodanService[] = (raw.data ?? []).map((svc) => ({
    port: svc.port ?? 0,
    transport: svc.transport ?? "tcp",
    product: svc.product,
    version: svc.version,
    cpe: svc.cpe,
    timestamp: svc.timestamp,
    vulns: Array.isArray(svc.vulns) ? svc.vulns : svc.vulns ? Object.keys(svc.vulns) : undefined,
  }))

  return {
    ip: raw.ip_str ?? ip,
    ports: Array.isArray(raw.ports) ? raw.ports : [],
    hostnames: Array.isArray(raw.hostnames) ? raw.hostnames : [],
    org: raw.org,
    isp: raw.isp,
    os: raw.os ?? undefined,
    lastUpdate: raw.last_update,
    services,
    vulns: Array.isArray(raw.vulns) ? raw.vulns : [],
  }
}

export interface ShodanScanSubmission {
  id: string
  count: number
  creditsLeft?: number
}

/**
 * Request an on-demand scan of an IP via `POST /shodan/scan`. Spends scan credits.
 * The route layer must gate this behind ENABLE_SHODAN_SCAN and audit-log it.
 */
export async function shodanScan(ip: string): Promise<ShodanScanSubmission> {
  const key = requireKey()
  if (!isPublicIPv4(ip)) {
    throw new ShodanApiError("Scans are only valid for public IPs", 400)
  }
  const res = await fetchWithTimeout(
    `${SHODAN_API_BASE}/shodan/scan?key=${encodeURIComponent(key)}`,
    REQUEST_TIMEOUT_MS,
    { method: "POST", body: new URLSearchParams({ ips: ip }) }
  )
  if (!res.ok) throw await shodanError(res)
  const raw = (await res.json()) as { id?: string; count?: number; credits_left?: number }
  if (!raw.id) throw new ShodanApiError("Shodan did not return a scan id")
  return { id: raw.id, count: raw.count ?? 1, creditsLeft: raw.credits_left }
}

export interface ShodanScanStatus {
  id: string
  status: string
}

/** Poll the status of a previously submitted scan via `GET /shodan/scan/{id}`. */
export async function shodanScanStatus(id: string): Promise<ShodanScanStatus> {
  const key = requireKey()
  const res = await fetchWithTimeout(
    `${SHODAN_API_BASE}/shodan/scan/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`
  )
  if (!res.ok) throw await shodanError(res)
  const raw = (await res.json()) as { id?: string; status?: string }
  return { id: raw.id ?? id, status: raw.status ?? "UNKNOWN" }
}

// ---------------------------------------------------------------------------
// Phase 3 — Shodan Monitor network alerts (private firehose).
// Lets the portal create and manage persistent monitoring alerts for a public
// IP/CIDR. Shodan continuously rescans and fires the enabled triggers when
// something changes (new port, new vuln, etc.). Plan-gated on Shodan's side
// (requires Monitor subscription or Academic Plus).
// ---------------------------------------------------------------------------

export interface ShodanAlertTrigger {
  name: string
  description: string
  rule?: string
}

export interface ShodanAlert {
  id: string
  name: string
  /** ISO 8601 creation timestamp */
  created: string
  /** 0 = never expires */
  expires: number
  /** Number of IPs covered */
  size: number
  filters: { ip: string[] }
  /** Trigger names currently enabled on this alert */
  triggers: string[]
  notifications?: string[]
}

/** List all Monitor alerts on the account. */
export async function shodanListAlerts(): Promise<ShodanAlert[]> {
  const key = requireKey()
  const res = await fetchWithTimeout(`${SHODAN_API_BASE}/shodan/alert/info?key=${encodeURIComponent(key)}`)
  if (res.status === 404) return []
  if (!res.ok) throw await shodanError(res)
  const raw = (await res.json()) as Array<{
    id?: string
    name?: string
    created?: string
    expires?: number
    size?: number
    filters?: { ip?: string[] }
    triggers?: Record<string, unknown> | string[]
    notifications?: string[]
  }>
  if (!Array.isArray(raw)) return []
  return raw.map((a) => ({
    id: a.id ?? "",
    name: a.name ?? "",
    created: a.created ?? "",
    expires: a.expires ?? 0,
    size: a.size ?? 0,
    filters: { ip: a.filters?.ip ?? [] },
    triggers: Array.isArray(a.triggers)
      ? a.triggers
      : a.triggers
        ? Object.keys(a.triggers)
        : [],
    notifications: a.notifications,
  }))
}

/**
 * Create a Monitor alert for a single public IP (/32 CIDR).
 * The alert is permanent (expires=0) and starts with no triggers enabled.
 */
export async function shodanCreateAlert(name: string, ip: string): Promise<ShodanAlert> {
  const key = requireKey()
  if (!isPublicIPv4(ip)) {
    throw new ShodanApiError("Monitor alerts are only valid for public IPs", 400)
  }
  const res = await fetchWithTimeout(
    `${SHODAN_API_BASE}/shodan/alert?key=${encodeURIComponent(key)}`,
    REQUEST_TIMEOUT_MS,
    {
      method: "POST",
      body: JSON.stringify({ name, filters: { ip: [`${ip}/32`] }, expires: 0 }),
    }
  )
  if (!res.ok) throw await shodanError(res)
  const raw = (await res.json()) as {
    id?: string
    name?: string
    created?: string
    expires?: number
    size?: number
    filters?: { ip?: string[] }
    triggers?: Record<string, unknown> | string[]
  }
  return {
    id: raw.id ?? "",
    name: raw.name ?? name,
    created: raw.created ?? new Date().toISOString(),
    expires: raw.expires ?? 0,
    size: raw.size ?? 1,
    filters: { ip: raw.filters?.ip ?? [`${ip}/32`] },
    triggers: Array.isArray(raw.triggers) ? raw.triggers : raw.triggers ? Object.keys(raw.triggers) : [],
  }
}

/** Delete a Monitor alert by ID. */
export async function shodanDeleteAlert(id: string): Promise<void> {
  const key = requireKey()
  const res = await fetchWithTimeout(
    `${SHODAN_API_BASE}/shodan/alert/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`,
    REQUEST_TIMEOUT_MS,
    { method: "DELETE" }
  )
  if (!res.ok) throw await shodanError(res)
}

/** List all available trigger types with descriptions. */
export async function shodanListTriggers(): Promise<ShodanAlertTrigger[]> {
  const key = requireKey()
  const res = await fetchWithTimeout(
    `${SHODAN_API_BASE}/shodan/alert/triggers?key=${encodeURIComponent(key)}`
  )
  if (!res.ok) throw await shodanError(res)
  const raw = (await res.json()) as Array<{
    name?: string
    description?: string
    rule?: string
  }>
  if (!Array.isArray(raw)) return []
  return raw.map((t) => ({ name: t.name ?? "", description: t.description ?? "", rule: t.rule }))
}

/** Enable a trigger on an existing alert. */
export async function shodanEnableTrigger(alertId: string, trigger: string): Promise<void> {
  const key = requireKey()
  const res = await fetchWithTimeout(
    `${SHODAN_API_BASE}/shodan/alert/${encodeURIComponent(alertId)}/trigger/${encodeURIComponent(trigger)}?key=${encodeURIComponent(key)}`,
    REQUEST_TIMEOUT_MS,
    { method: "PUT" }
  )
  if (!res.ok) throw await shodanError(res)
}

/** Disable a trigger on an existing alert. */
export async function shodanDisableTrigger(alertId: string, trigger: string): Promise<void> {
  const key = requireKey()
  const res = await fetchWithTimeout(
    `${SHODAN_API_BASE}/shodan/alert/${encodeURIComponent(alertId)}/trigger/${encodeURIComponent(trigger)}?key=${encodeURIComponent(key)}`,
    REQUEST_TIMEOUT_MS,
    { method: "DELETE" }
  )
  if (!res.ok) throw await shodanError(res)
}
