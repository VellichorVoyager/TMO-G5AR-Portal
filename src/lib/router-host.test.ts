import test from "node:test"
import assert from "node:assert/strict"
import {
  canonicalizeRouterHost,
  isCgnatIpv4,
  isPublicIPv4,
  normalizeAndValidateRouterHost,
  parseGatewayAllowedHosts,
} from "@/lib/router-host"

test("isPublicIPv4 accepts globally routable addresses", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.114.5", "172.15.0.1", "172.32.0.1"]) {
    assert.equal(isPublicIPv4(ip), true, ip)
  }
})

test("isPublicIPv4 rejects private, reserved, CGNAT and invalid addresses", () => {
  for (const ip of [
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.12.1",
    "127.0.0.1",
    "169.254.1.1",
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1", // multicast
    "255.255.255.255",
    "203.0.113.7", // TEST-NET-3
    "not.an.ip",
    "256.1.1.1",
  ]) {
    assert.equal(isPublicIPv4(ip), false, ip)
  }
})

test("isCgnatIpv4 detects 100.64.0.0/10 and nothing else", () => {
  assert.equal(isCgnatIpv4("100.64.0.1"), true)
  assert.equal(isCgnatIpv4("100.127.255.255"), true)
  assert.equal(isCgnatIpv4("100.63.255.255"), false)
  assert.equal(isCgnatIpv4("100.128.0.0"), false)
  assert.equal(isCgnatIpv4("8.8.8.8"), false)
})

test("canonicalizeRouterHost trims and normalizes case", () => {
  assert.equal(canonicalizeRouterHost("  Router.Local  "), "router.local")
})

test("normalizeAndValidateRouterHost allows default gateway host", () => {
  assert.equal(normalizeAndValidateRouterHost("192.168.12.1"), "192.168.12.1")
})

test("normalizeAndValidateRouterHost rejects public IPs", () => {
  assert.throws(() => normalizeAndValidateRouterHost("8.8.8.8"), /private IPv4/)
})

test("normalizeAndValidateRouterHost rejects public IPs even if explicitly allowlisted", () => {
  const allowedHosts = parseGatewayAllowedHosts("8.8.8.8")
  assert.throws(
    () => normalizeAndValidateRouterHost("8.8.8.8", { allowedHosts, allowCustomGatewayHost: true }),
    /private IPv4/
  )
})

test("normalizeAndValidateRouterHost rejects loopback, link-local, metadata and zero addresses", () => {
  for (const blockedHost of ["127.0.0.1", "169.254.1.1", "169.254.169.254", "0.0.0.0"]) {
    assert.throws(() => normalizeAndValidateRouterHost(blockedHost), /not allowed/)
  }
})

test("normalizeAndValidateRouterHost rejects blocked IPv4s even if explicitly allowlisted", () => {
  for (const blockedHost of ["127.0.0.1", "169.254.1.1", "169.254.169.254", "0.0.0.0"]) {
    const allowedHosts = parseGatewayAllowedHosts(blockedHost)
    assert.throws(
      () => normalizeAndValidateRouterHost(blockedHost, { allowedHosts, allowCustomGatewayHost: true }),
      /not allowed/
    )
  }
})

test("normalizeAndValidateRouterHost rejects hostnames not explicitly allowlisted", () => {
  assert.throws(() => normalizeAndValidateRouterHost("router.local"), /allowlisted/)
})

test("normalizeAndValidateRouterHost allows hostnames explicitly allowlisted", () => {
  assert.equal(
    normalizeAndValidateRouterHost("router.local", {
      allowedHosts: parseGatewayAllowedHosts("router.local"),
    }),
    "router.local"
  )
})

test("normalizeAndValidateRouterHost allows custom private IPv4 when custom hosts are enabled", () => {
  assert.equal(
    normalizeAndValidateRouterHost("192.168.1.1", { allowCustomGatewayHost: true }),
    "192.168.1.1"
  )
})

test("normalizeAndValidateRouterHost allows custom private IPv4 when explicitly allowlisted", () => {
  assert.equal(
    normalizeAndValidateRouterHost("192.168.1.1", {
      allowedHosts: parseGatewayAllowedHosts("192.168.1.1"),
    }),
    "192.168.1.1"
  )
})

test("parseGatewayAllowedHosts canonicalizes and ignores invalid entries", () => {
  assert.deepEqual(
    Array.from(parseGatewayAllowedHosts(" ROUTER.LOCAL , 192.168.1.1, not valid")).sort(),
    ["192.168.1.1", "router.local"]
  )
})

test("canonicalizeRouterHost rejects ambiguous IPv4 strings with leading zeroes", () => {
  for (const host of ["010.000.000.001", "192.168.001.001", "001.002.003.004"]) {
    assert.throws(() => canonicalizeRouterHost(host), /Invalid router IP or hostname/)
  }
})
