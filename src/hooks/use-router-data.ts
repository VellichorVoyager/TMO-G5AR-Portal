"use client"

import useSWR from "swr"
import {
  NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
  POLL_INTERVAL_FAST,
  POLL_INTERVAL_SLOW,
} from "@/lib/config-client"

// Track if we're already redirecting to prevent multiple redirects
let isRedirecting = false
let shouldStopPolling = false

export function resetAuthPollingState() {
  isRedirecting = false
  shouldStopPolling = false
}

async function handleUnauthorized() {
  if (isRedirecting) return
  shouldStopPolling = true
  isRedirecting = true

  // Clear cookies on server and wait for response
  try {
    const response = await fetch("/api/router/logout", {
      method: "POST",
      credentials: "same-origin", // Ensure cookies are sent and received
    })
    // Wait for the response to ensure cookies are cleared
    await response.json()
  } catch {
    // Ignore errors, proceed to redirect
  }

  // Small delay to ensure cookies are processed by browser
  await new Promise(resolve => setTimeout(resolve, 100))

  // Use replace to prevent back button issues
  window.location.replace("/login")
}

const fetcher = async (url: string) => {
  // Stop all polling once auth has failed and redirect has started
  if (shouldStopPolling || isRedirecting) {
    throw new Error("Not authenticated")
  }

  const res = await fetch(url, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  })

  // Check for 401 status before parsing JSON
  if (res.status === 401) {
    shouldStopPolling = true
    void handleUnauthorized()
    throw new Error("Not authenticated")
  }

  const data = await res.json()

  // Also check for auth error in response body
  if (data.error === "Not authenticated") {
    shouldStopPolling = true
    void handleUnauthorized()
    throw new Error("Not authenticated")
  }

  return data
}

export interface GatewayHealthStatus {
  status: "online" | "offline" | "error"
  host: string
  message?: string
}

export interface RouterCapabilities {
  writeActionsEnabled: boolean
}

export function useRouterCapabilities() {
  return useSWR<RouterCapabilities>("/api/router/capabilities", fetcher, {
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    shouldRetryOnError: false,
  })
}

export function useGatewayHealth() {
  return useSWR<GatewayHealthStatus>("/api/router/health", fetcher, {
    refreshInterval: () => (shouldStopPolling ? 0 : POLL_INTERVAL_FAST),
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    shouldRetryOnError: false,
  })
}

export function useGatewayInfo() {
  return useGatewayInfoWithInterval(POLL_INTERVAL_FAST)
}

function useGatewayInfoWithInterval(interval: number) {
  return useSWR("/api/router/gateway", fetcher, {
    refreshInterval: () => (shouldStopPolling ? 0 : interval),
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    keepPreviousData: true,
    shouldRetryOnError: false,
  })
}

export function useGatewayInfoSlow() {
  return useGatewayInfoWithInterval(POLL_INTERVAL_SLOW)
}

export function useSignalInfo() {
  return useSWR("/api/router/signal", fetcher, {
    refreshInterval: () => (shouldStopPolling ? 0 : POLL_INTERVAL_FAST),
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    keepPreviousData: true,
    shouldRetryOnError: false,
  })
}

export function useCellInfo() {
  return useSWR("/api/router/cell", fetcher, {
    refreshInterval: () => (shouldStopPolling ? 0 : POLL_INTERVAL_FAST),
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    keepPreviousData: true,
    shouldRetryOnError: false,
  })
}

export function useClients() {
  return useSWR("/api/router/clients", fetcher, {
    refreshInterval: () => (shouldStopPolling ? 0 : POLL_INTERVAL_FAST * 2),
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    keepPreviousData: true,
    shouldRetryOnError: false,
  })
}

export function useSimInfo() {
  return useSWR("/api/router/sim", fetcher, {
    refreshInterval: () => (shouldStopPolling ? 0 : POLL_INTERVAL_SLOW),
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    keepPreviousData: true,
    shouldRetryOnError: false,
  })
}

export function useApConfig() {
  return useSWR("/api/router/ap", fetcher, {
    refreshInterval: () => (shouldStopPolling ? 0 : POLL_INTERVAL_SLOW),
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    shouldRetryOnError: false,
  })
}

export interface VersionInfo {
  version: number
}

export function useVersion() {
  return useSWR<VersionInfo>("/api/router/version", fetcher, {
    refreshInterval: () => (shouldStopPolling ? 0 : POLL_INTERVAL_SLOW),
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    shouldRetryOnError: false,
  })
}

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
    "2.4ghz": Array<{
      connected: boolean
      ipv4: string
      ipv6: string[]
      mac: string
      name: string
      signal?: number
    }>
    "5.0ghz": Array<{
      connected: boolean
      ipv4: string
      ipv6: string[]
      mac: string
      name: string
      signal?: number
    }>
    ethernet: Array<{
      connected: boolean
      ipv4: string
      ipv6: string[]
      mac: string
      name: string
    }>
    wifi: Array<{
      connected: boolean
      ipv4: string
      ipv6: string[]
      mac: string
      name: string
      signal?: number
    }>
  }
  sim: {
    iccId: string
    imei: string
    imsi: string
    msisdn: string
    status: boolean
  }
}

// Combined telemetry hook - fetches cell, clients, and sim in one call
export function useTelemetryAll() {
  return useSWR<TelemetryAll>("/api/router/telemetry", fetcher, {
    refreshInterval: () => (shouldStopPolling ? 0 : POLL_INTERVAL_FAST),
    revalidateOnFocus: NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
    shouldRetryOnError: false,
  })
}
