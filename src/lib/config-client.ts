import { toBoolean, toNumber } from "@/lib/config-shared"

export const POLL_INTERVAL_FAST = toNumber(process.env.NEXT_PUBLIC_POLL_INTERVAL_FAST, 5000)

export const POLL_INTERVAL_SLOW = toNumber(process.env.NEXT_PUBLIC_POLL_INTERVAL_SLOW, 30000)

export const NEXT_PUBLIC_REVALIDATE_ON_FOCUS = toBoolean(
  process.env.NEXT_PUBLIC_REVALIDATE_ON_FOCUS,
  false
)
