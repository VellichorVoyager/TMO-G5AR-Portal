export const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback
  const normalized = value.trim().toLowerCase()
  if (!normalized) return fallback
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export const toSameSite = (
  value: string | undefined,
  fallback: "strict" | "lax" | "none"
): "strict" | "lax" | "none" => {
  const normalized = value?.trim().toLowerCase()
  if (normalized === "strict" || normalized === "lax" || normalized === "none") {
    return normalized
  }
  return fallback
}

export const toEffectiveCookieSecure = (
  secure: boolean,
  sameSite: "strict" | "lax" | "none"
): boolean => secure || sameSite === "none"

export const toWriteActionsEnabled = (value: string | undefined, fallback: boolean): boolean =>
  toBoolean(value, fallback)
