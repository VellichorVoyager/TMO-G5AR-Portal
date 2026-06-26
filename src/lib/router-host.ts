export const DEFAULT_ROUTER_HOST = "192.168.12.1"

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/
const HOSTNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i

const INVALID_ROUTER_HOST_ERROR = "Invalid router IP or hostname"

export function isValidIpv4(value: string): boolean {
  const parts = value.split(".")
  return parts.length === 4 && parts.every((part) => {
    if (part.length > 1 && part.startsWith("0")) {
      return false
    }
    const num = Number(part)
    return Number.isInteger(num) && num >= 0 && num <= 255
  })
}

export function canonicalizeRouterHost(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) {
    throw new Error(INVALID_ROUTER_HOST_ERROR)
  }

  if (IPV4_PATTERN.test(trimmed)) {
    if (!isValidIpv4(trimmed)) {
      throw new Error(INVALID_ROUTER_HOST_ERROR)
    }
    return trimmed.split(".").map((part) => String(Number(part))).join(".")
  }

  if (!HOSTNAME_PATTERN.test(trimmed)) {
    throw new Error(INVALID_ROUTER_HOST_ERROR)
  }

  return trimmed
}

function isIpv4(value: string): boolean {
  return IPV4_PATTERN.test(value)
}

function getIpv4Octets(ip: string): number[] {
  return ip.split(".").map((part) => Number(part))
}

function isLoopbackIpv4(ip: string): boolean {
  const [a] = getIpv4Octets(ip)
  return a === 127
}

function isLinkLocalIpv4(ip: string): boolean {
  const [a, b] = getIpv4Octets(ip)
  return a === 169 && b === 254
}

function isMetadataIpv4(ip: string): boolean {
  return ip === "169.254.169.254"
}

function isZeroIpv4(ip: string): boolean {
  return ip === "0.0.0.0"
}

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = getIpv4Octets(ip)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function isBlockedIpv4(ip: string): boolean {
  return isLoopbackIpv4(ip) || isLinkLocalIpv4(ip) || isMetadataIpv4(ip) || isZeroIpv4(ip)
}

// 100.64.0.0/10 — carrier-grade NAT shared address space (RFC 6598).
// T-Mobile Home Internet frequently sits behind CGNAT, so the gateway often has
// no directly reachable public IP. This is treated as a first-class result by the
// exposure check rather than an error.
export function isCgnatIpv4(value: string): boolean {
  if (!isValidIpv4(value)) return false
  const [a, b] = getIpv4Octets(value)
  return a === 100 && b >= 64 && b <= 127
}

// True only for globally routable IPv4 addresses — the inverse of the gateway-host
// guards above. Used by the exposure check, which must refuse to query Shodan for
// anything that isn't a genuine public IP (private, loopback, link-local,
// metadata, CGNAT, multicast, documentation, and reserved ranges all return false).
export function isPublicIPv4(value: string): boolean {
  if (!isValidIpv4(value)) return false
  const [a, b, c] = getIpv4Octets(value)

  if (a === 0) return false // 0.0.0.0/8 "this network"
  if (a === 10) return false // 10/8 private
  if (a === 127) return false // 127/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return false // 100.64/10 CGNAT
  if (a === 169 && b === 254) return false // 169.254/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return false // 172.16/12 private
  if (a === 192 && b === 168) return false // 192.168/16 private
  if (a === 192 && b === 0 && c === 0) return false // 192.0.0/24 IETF protocol
  if (a === 192 && b === 0 && c === 2) return false // 192.0.2/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false // 198.18/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return false // 198.51.100/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false // 203.0.113/24 TEST-NET-3
  if (a >= 224) return false // 224/4 multicast, 240/4 reserved, 255.255.255.255 broadcast

  return true
}

export function parseGatewayAllowedHosts(value: string | undefined): Set<string> {
  if (!value) return new Set()

  const allowedHosts = new Set<string>()
  for (const host of value.split(",")) {
    const trimmedHost = host.trim()
    if (!trimmedHost) continue
    try {
      allowedHosts.add(canonicalizeRouterHost(trimmedHost))
    } catch {
      console.warn(`[router-host] Ignoring invalid GATEWAY_ALLOWED_HOSTS entry: "${trimmedHost}"`)
    }
  }
  return allowedHosts
}

export function normalizeAndValidateRouterHost(
  value: string,
  options: { allowCustomGatewayHost?: boolean; allowedHosts?: Set<string> } = {}
): string {
  const host = canonicalizeRouterHost(value)
  const allowedHosts = options.allowedHosts ?? new Set<string>()
  const allowCustomGatewayHost = options.allowCustomGatewayHost ?? false

  if (host === DEFAULT_ROUTER_HOST) {
    return host
  }

  const isExplicitlyAllowed = allowedHosts.has(host)
  const ipv4 = isIpv4(host)

  if (!ipv4) {
    if (!isExplicitlyAllowed) {
      throw new Error("Hostnames must be explicitly allowlisted")
    }
    return host
  }

  if (isBlockedIpv4(host)) {
    throw new Error("Router host is not allowed")
  }

  if (!isPrivateIpv4(host)) {
    throw new Error("Router host must be a private IPv4 address")
  }

  if (!allowCustomGatewayHost && !isExplicitlyAllowed) {
    throw new Error("Custom router hosts are disabled")
  }

  return host
}
