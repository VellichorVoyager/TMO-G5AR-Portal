const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const REQUEST_TIMEOUT_MS = toNumber(process.env.REQUEST_TIMEOUT_MS, 5000)

export const POLL_INTERVAL_FAST = toNumber(
  process.env.NEXT_PUBLIC_POLL_INTERVAL_FAST ?? process.env.POLL_INTERVAL_FAST,
  5000
)

export const POLL_INTERVAL_SLOW = toNumber(
  process.env.NEXT_PUBLIC_POLL_INTERVAL_SLOW ?? process.env.POLL_INTERVAL_SLOW,
  30000
)
