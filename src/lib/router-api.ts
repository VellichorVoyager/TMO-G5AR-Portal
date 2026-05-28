import { cookies } from "next/headers"
import {
  ALLOW_CUSTOM_GATEWAY_HOST,
  GATEWAY_ALLOWED_HOSTS,
  REQUEST_TIMEOUT_MS,
} from "@/lib/config-server"
import {
  DEFAULT_ROUTER_HOST,
  normalizeAndValidateRouterHost,
  parseGatewayAllowedHosts,
} from "@/lib/router-host"

const ROUTER_HOST_COOKIE = "router_ip"
const GATEWAY_ALLOWED_HOSTS_SET = parseGatewayAllowedHosts(GATEWAY_ALLOWED_HOSTS)

export class RouterRequestError extends Error {
  status?: number
  code?: string

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = "RouterRequestError"
    this.status = status
    this.code = code
  }
}

export function normalizeRouterHost(value: string): string {
  try {
    return normalizeAndValidateRouterHost(value, {
      allowCustomGatewayHost: ALLOW_CUSTOM_GATEWAY_HOST,
      allowedHosts: GATEWAY_ALLOWED_HOSTS_SET,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid router host"
    throw new RouterRequestError(message, undefined, "INVALID_ROUTER_HOST")
  }
}

export function getRouterHost(): string {
  const cookieStore = cookies()
  // Keep the legacy router_ip cookie name so existing sessions retain their selected host.
  const cookieRouterHost = cookieStore.get(ROUTER_HOST_COOKIE)?.value
  if (!cookieRouterHost) return DEFAULT_ROUTER_HOST

  try {
    return normalizeRouterHost(cookieRouterHost)
  } catch {
    return DEFAULT_ROUTER_HOST
  }
}

export function getAuthToken(): string {
  const cookieStore = cookies()
  const token = cookieStore.get("auth_token")?.value

  if (!token) {
    throw new Error("Not authenticated")
  }

  return token
}

export async function routerFetch<T>(
  endpoint: string,
  options: { auth?: boolean; method?: string; body?: unknown; routerHost?: string; timeoutMs?: number } = {}
): Promise<T> {
  const { auth = false, method = "GET", body, routerHost: explicitRouterHost, timeoutMs = REQUEST_TIMEOUT_MS } = options

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (auth) {
    const token = getAuthToken()
    headers["Authorization"] = `Bearer ${token}`
  }

  const routerHost = explicitRouterHost ? normalizeRouterHost(explicitRouterHost) : getRouterHost()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`http://${routerHost}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (error) {
    const isErrorObject = error instanceof Error
    const errorMessage = isErrorObject
      ? error.message
      : "Network request failed with non-Error exception"
    const isTimeout = isErrorObject && error.name === "AbortError"
    const message = isTimeout
      ? `Request timeout after ${timeoutMs}ms`
      : errorMessage
    throw new RouterRequestError(message, undefined, isTimeout ? "TIMEOUT" : "NETWORK_ERROR")
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    // Handle authentication errors from the gateway
    if (auth && (response.status === 401 || response.status === 403)) {
      throw new RouterRequestError("Not authenticated", response.status)
    }
    const error = await response.json().catch(() => ({}))
    throw new RouterRequestError(
      error.result?.message || `Request failed: ${response.status}`,
      response.status
    )
  }

  // Handle empty responses (common for POST requests)
  const text = await response.text()
  if (!text) {
    return {} as T
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new RouterRequestError("Router returned malformed JSON", response.status, "INVALID_JSON")
  }
}

// API Types
export interface GatewayInfo {
  device: {
    hardwareVersion: string
    macId: string
    manufacturer: string
    model: string
    role: string
    serial: string
    softwareVersion: string
  }
  signal: {
    "5g": {
      antennaUsed: string
      bands: string[]
      bars: number
      cid: number
      gNBID: number
      rsrp: number
      rsrq: number
      rssi: number
      sinr: number
    }
    "4g"?: {
      antennaUsed: string
      bands: string[]
      bars: number
      cid: number
      eNBID: number
      rsrp: number
      rsrq: number
      rssi: number
      sinr: number
    }
    generic: {
      apn: string
      hasIPv6: boolean
      registration: string
    }
  }
  time: {
    localTime: number
    localTimeZone: string
    upTime: number
  }
}

export interface SignalInfo {
  signal: {
    "5g": {
      antennaUsed: string
      bands: string[]
      bars: number
      cid: number
      gNBID: number
      rsrp: number
      rsrq: number
      rssi: number
      sinr: number
    }
    generic: {
      apn: string
      hasIPv6: boolean
      registration: string
    }
  }
}

export interface CellInfo {
  cell: {
    "5g": {
      cqi: number
      ecgi: string
      sector: {
        antennaUsed: string
        bands: string[]
        bars: number
        cid: number
        gNBID: number
        rsrp: number
        rsrq: number
        rssi: number
        sinr: number
      }
    }
    generic: {
      apn: string
      hasIPv6: boolean
      registration: string
    }
    gps: {
      latitude: number
      longitude: number
    }
  }
}

export interface ClientInfo {
  clients: {
    "2.4ghz": Client[]
    "5.0ghz": Client[]
    "6.0ghz"?: Client[]
    ethernet: Client[]
    wifi: Client[]
  }
}

export interface Client {
  connected: boolean
  ipv4: string
  ipv6: string[]
  mac: string
  name: string
  signal?: number
}

export interface SimInfo {
  sim: {
    iccId: string
    imei: string
    imsi: string
    msisdn: string
    status: boolean
  }
}

export interface ApConfig {
  "2.4ghz": { isRadioEnabled: boolean }
  "5.0ghz": { isRadioEnabled: boolean }
  "6.0ghz"?: { isRadioEnabled: boolean }
  ssids: {
    "2.4ghzSsid": boolean
    "5.0ghzSsid": boolean
    "6.0ghzSsid"?: boolean
    encryptionMode: string
    encryptionVersion: string
    guest: boolean
    isBroadcastEnabled: boolean
    ssidName: string
    wpaKey: string
  }[]
}

export interface VersionInfo {
  version: number
}

export interface LoginResponse {
  auth?: {
    token: string
    expiration: number
  }
  result?: {
    message?: string
  }
}

// Combined telemetry response (cell + clients + sim in one call)
export interface TelemetryAll {
  cell: {
    "5g": {
      cqi: number
      ecgi: string
      sector: {
        antennaUsed: string
        bands: string[]
        bars: number
        cid: number
        gNBID: number
        rsrp: number
        rsrq: number
        rssi: number
        sinr: number
      }
    }
    generic: {
      apn: string
      hasIPv6: boolean
      registration: string
    }
    gps: {
      latitude: number
      longitude: number
    }
  }
  clients: {
    "2.4ghz": Client[]
    "5.0ghz": Client[]
    "6.0ghz"?: Client[]
    ethernet: Client[]
    wifi: Client[]
  }
  sim: {
    iccId: string
    imei: string
    imsi: string
    msisdn: string
    status: boolean
  }
}

// API Functions
export async function getGatewayInfo(): Promise<GatewayInfo> {
  return routerFetch<GatewayInfo>("/TMI/v1/gateway?get=all")
}

export async function getSignalInfo(): Promise<SignalInfo> {
  return routerFetch<SignalInfo>("/TMI/v1/gateway?get=signal")
}

export async function getCellInfo(): Promise<CellInfo> {
  return routerFetch<CellInfo>("/TMI/v1/network/telemetry?get=cell", { auth: true })
}

export async function getClients(): Promise<ClientInfo> {
  return routerFetch<ClientInfo>("/TMI/v1/network/telemetry?get=clients", { auth: true })
}

export async function getSimInfo(): Promise<SimInfo> {
  return routerFetch<SimInfo>("/TMI/v1/network/telemetry?get=sim", { auth: true })
}

export async function getApConfig(): Promise<ApConfig> {
  return routerFetch<ApConfig>("/TMI/v1/network/configuration/v2?get=ap", { auth: true })
}

export async function setApConfig(config: Partial<ApConfig>): Promise<void> {
  return routerFetch("/TMI/v1/network/configuration/v2?set=ap", {
    auth: true,
    method: "POST",
    body: config,
  })
}

export async function rebootGateway(): Promise<void> {
  return routerFetch("/TMI/v1/gateway/reset?set=reboot", {
    auth: true,
    method: "POST",
  })
}

export async function getVersion(options: { routerHost?: string } = {}): Promise<VersionInfo> {
  return routerFetch<VersionInfo>("/TMI/v1/version", options)
}

export async function getTelemetryAll(): Promise<TelemetryAll> {
  return routerFetch<TelemetryAll>("/TMI/v1/network/telemetry?get=all", { auth: true })
}

export async function loginRouter(
  username: string,
  password: string,
  routerHost: string
): Promise<LoginResponse> {
  return routerFetch<LoginResponse>("/TMI/v1/auth/login", {
    method: "POST",
    body: { username, password },
    routerHost,
  })
}
