import test from "node:test"
import assert from "node:assert/strict"
import {
  canonicalizeRouterHost,
  normalizeAndValidateRouterHost,
  parseGatewayAllowedHosts,
} from "@/lib/router-host"

test("canonicalizeRouterHost trims and normalizes case", () => {
  assert.equal(canonicalizeRouterHost("  Router.Local  "), "router.local")
})

test("normalizeAndValidateRouterHost allows default gateway host", () => {
  assert.equal(normalizeAndValidateRouterHost("192.168.12.1"), "192.168.12.1")
})

test("normalizeAndValidateRouterHost rejects public IPs", () => {
  assert.throws(() => normalizeAndValidateRouterHost("8.8.8.8"), /private IPv4/)
})

test("normalizeAndValidateRouterHost rejects loopback, link-local, metadata and zero addresses", () => {
  for (const blockedHost of ["127.0.0.1", "169.254.1.1", "169.254.169.254", "0.0.0.0"]) {
    assert.throws(() => normalizeAndValidateRouterHost(blockedHost), /not allowed/)
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
