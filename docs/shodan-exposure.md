# Design: WAN Exposure Page (Shodan integration)

> Status: **Proposed** · Owner: @VellichorVoyager · Last updated: 2026-06-26

A new **Exposure** page that answers the one question this portal currently can't:
*"What does the internet see when it looks back at my gateway's public IP?"*

The portal today is entirely **LAN-facing** — it shows devices connected behind the
gateway (e.g. a Quest 3 on `192.168.12.x`), signal, WiFi, etc. Shodan adds the
**WAN-facing** view. Together they form a complete picture: *what's on my network*
(existing) + *what's exposed to the internet* (new).

## Core constraint (drives the entire design)

**Shodan only ever sees public IPs.** It physically cannot scan `192.168.12.136`
(the Quest) or `192.168.12.1` (the gateway LAN side) — those are RFC 1918 private
addresses unreachable from Shodan's scanners. So this feature is **not** "scan my
Quest." It is:

> Resolve my gateway's **public/WAN IP**, then check whether anything is exposed
> on it.

LAN-side scanning of the Quest (ports 5555 ADB, 57961 OculusDeveloper, etc.) is a
separate concern handled by local tools (`nmap`/`masscan`) and is explicitly **out
of scope** for this page. It could become a sibling scripts folder later, but it is
not part of the web app.

## Cost posture

Build **free-first**. Phase 1 spends zero credits and needs no API key. Keyed
features (Phase 2+) are gated behind an optional env var and only spend credits on
explicit user action — never on page load.

| Data source | API key? | Credits? | Phase |
|---|---|---|---|
| **InternetDB** `https://internetdb.shodan.io/{ip}` | No | Free | 1 |
| **CVEDB** `https://cvedb.shodan.io/cve?...` | No | Free | 1 |
| **Host lookup** `/shodan/host/{ip}` | Yes | 1 query credit | 2 |
| **On-demand scan** `/shodan/scan` | Yes | Scan credits | 2 |
| **Monitor / network alerts** `/shodan/alert` | Yes | Plan-gated | 3 |

Account on file is **Shodan Academic Plus**, which covers the keyed Phase 2/3
features when we get there. The API key goes in `.env.local` as `SHODAN_API_KEY`
(server-side only, never `NEXT_PUBLIC_`) — but **not needed to ship Phase 1**.

## Architecture (mirrors existing repo patterns)

### 1. Resolve the public/WAN IP

This is the one genuine unknown and the first thing to verify when building. Three
options, in order of preference:

1. **From the gateway API** — if the G5AR exposes its WAN/public IP in
   `GET /TMI/v1/gateway?get=all` or telemetry. Preferred: no third party, no
   leak. *Needs verification against the live device — the README's endpoint table
   doesn't confirm a WAN-IP field.*
2. **Server-side detection** — the Next.js server calls a lightweight echo service
   (e.g. `https://api.ipify.org`) to learn the egress IP. Works on cellular/CGNAT
   but reveals only what the portal host sees.
3. **Manual entry** — user types/pastes their public IP. Always available as a
   fallback and for checking a static IP that isn't the current egress.

> **CGNAT note:** T-Mobile Home Internet is frequently behind **CGNAT**, so the
> gateway often has *no* directly reachable public IP. This is worth surfacing as a
> first-class result state ("You appear to be behind CGNAT — not directly
> internet-reachable, which is good for exposure"), not an error. It's arguably the
> most common real outcome for this hardware.

### 2. API route — `src/app/api/router/exposure/route.ts`

Server route (keeps any API key server-side, exactly like the gateway proxy does):

- `GET /api/router/exposure` → resolves WAN IP, queries **InternetDB**, returns
  `{ ip, source, ports, cpes, vulns, hostnames, tags }` plus a `behindCgnat` flag.
- Validates the target is a **public** IP before querying. Reuse / extend the
  existing `src/lib/router-host.ts` guards, which already reject private, loopback,
  link-local, and metadata ranges — here we want the *inverse* (must be public),
  so add a small `isPublicIPv4` helper rather than duplicating logic.
- Apply the existing `src/lib/rate-limit.ts` to avoid hammering InternetDB.
- `REQUEST_TIMEOUT_MS` already exists for outbound calls — reuse it.

Phase 2 adds `POST /api/router/exposure/scan` (on-demand Shodan scan) and a CVE
detail lookup, both behind the key + enable flag, both audit-logged via the
existing `src/lib/audit-logger.ts` since a scan is a credit-spending action.

### 3. Config — `src/lib/config-server.ts` + `config-shared.ts`

Add, following the existing `toBoolean`/`toNumber` helpers and safe-by-default
philosophy:

```env
# Shodan exposure checks (all optional; Phase 1 needs none of these)
ENABLE_EXPOSURE_CHECKS=true        # master switch for the page/route
SHODAN_API_KEY=                    # Phase 2+ only; server-side, never NEXT_PUBLIC
ENABLE_SHODAN_SCAN=false           # gates credit-spending on-demand scans
EXPOSURE_PUBLIC_IP=                # optional manual override of detected WAN IP
```

Defaults keep behavior conservative: page works with InternetDB out of the box,
scans stay off until explicitly enabled (same pattern as `ENABLE_WRITE_ACTIONS`).

### 4. Capability flag — `src/app/api/router/capabilities/route.ts`

Extend the existing capabilities payload so the UI can render conditionally without
leaking the key:

```ts
return NextResponse.json({
  writeActionsEnabled: ENABLE_WRITE_ACTIONS,
  exposureChecksEnabled: ENABLE_EXPOSURE_CHECKS,
  shodanKeyConfigured: Boolean(SHODAN_API_KEY),   // boolean only — never the key
  shodanScanEnabled: ENABLE_SHODAN_SCAN,
})
```

### 5. UI — `src/app/(dashboard)/exposure/page.tsx` + sidebar entry

- New page next to Devices/Cell, using existing `Card`, `Badge`, `Table`, and
  `Skeleton` components and an SWR hook in the style of `use-router-data.ts`.
- Add to `navItems` in `src/components/sidebar.tsx` — proposed icon `ShieldAlert`
  or `Globe` from `lucide-react`, label **"Exposure"**.
- Result states to design for:
  - ✅ **No exposure / CGNAT** — green, reassuring.
  - ⚠️ **Open ports found** — list port + service + any matched CVEs from
    InternetDB's `vulns`.
  - ❓ **Unknown** — InternetDB has no record (common; means "not seen exposed").
- Each open port links out to its Shodan host page; each CVE links to its CVEDB /
  NVD entry.
- "Re-scan" button only renders when `shodanScanEnabled` is true (Phase 2).

## Phasing

| Phase | Scope | Key? | Cost |
|---|---|---|---|
| **1** | WAN IP resolution, InternetDB exposure check, CVEDB lookups, Exposure page + sidebar, CGNAT handling | No | Free |
| **2** | `SHODAN_API_KEY` host lookup (richer banners), audit-logged on-demand scan behind `ENABLE_SHODAN_SCAN` | Yes | Credits on action |
| **3** | Shodan Monitor network alert for the WAN IP; surface new-port alerts in the portal | Yes | Plan-gated |

**Phase 1 is the entire no-cost deliverable** and is independently shippable.

## Security & safety (consistent with SECURITY.md / README posture)

- API key is **server-only**; never sent to the browser, never `NEXT_PUBLIC_`,
  never logged. UI only ever sees the `shodanKeyConfigured` boolean.
- Exposure route validates the target is a **public** IP and rate-limits outbound
  calls.
- On-demand scans are **off by default**, gated by `ENABLE_SHODAN_SCAN`, and
  audit-logged (they spend credits and actively probe an IP).
- The portal still must not be exposed to the internet itself (unchanged guidance).
- Don't persist or display the full public IP in any shared artifact (screenshots,
  exported diagnostics) without the user opting in — mirror existing diagnostics
  redaction.

## Open questions

1. Does the G5AR API actually return the WAN/public IP anywhere? (Verify against
   the live device; falls back to server-side detection / manual entry if not.)
2. Is this gateway behind CGNAT on the user's line? (Determines whether exposure
   checks are ever meaningful, or whether the page mostly reports "behind CGNAT.")
3. Should Phase 1 cache the last InternetDB result locally (like historical signal
   data) for an at-a-glance "last checked" timestamp?

## Out of scope (explicitly)

- LAN scanning of the Quest or any `192.168.12.x` device (use local `nmap`).
- Installing anything on the Quest (it's a client device).
- A standalone scripts folder (declined for now in favor of the in-portal page).
