export const DEFAULT_ROUTER_HOST = "192.168.12.1"

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/
const HOSTNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i

const INVALID_ROUTER_HOST_ERROR = "Invalid router IP or hostname"

export function isValidIpv4(value: string): boolean {
  const parts = value.split(".")
  return parts.length === 4 && parts.every((part) => {
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
    return trimmed
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

export function parseGatewayAllowedHosts(value: string | undefined): Set<string> {
  if (!value) return new Set()

  const allowedHosts = new Set<string>()
  for (const host of value.split(",")) {
    const trimmedHost = host.trim()
    if (!trimmedHost) continue
    try {
      allowedHosts.add(canonicalizeRouterHost(trimmedHost))
    } catch {
      // Ignore invalid entries so config remains fail-closed.
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
