import test from "node:test"
import assert from "node:assert/strict"
import { toBoolean, toSameSite } from "@/lib/config"

test("toBoolean parses common true/false forms", () => {
  assert.equal(toBoolean("true", false), true)
  assert.equal(toBoolean("1", false), true)
  assert.equal(toBoolean("false", true), false)
  assert.equal(toBoolean("0", true), false)
})

test("toBoolean falls back on invalid values", () => {
  assert.equal(toBoolean("maybe", true), true)
  assert.equal(toBoolean(undefined, false), false)
})

test("toSameSite parses accepted values and defaults safely", () => {
  assert.equal(toSameSite("strict", "lax"), "strict")
  assert.equal(toSameSite("LAX", "strict"), "lax")
  assert.equal(toSameSite("none", "strict"), "none")
  assert.equal(toSameSite("invalid", "strict"), "strict")
  assert.equal(toSameSite(undefined, "strict"), "strict")
})
