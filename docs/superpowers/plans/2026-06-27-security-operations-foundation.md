# Metameros Network — Security Operations Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Spec:** [2026-06-27-security-operations-foundation-design.md](../specs/2026-06-27-security-operations-foundation-design.md)

**Goal:** Ship Release 1 — a privileged local **collector**, the **asset/finding**
data model, **deterministic detection**, and a **read-only AI Copilot** — and, on a
parallel track, bring the **Quest onto Tailscale** and stand up the **GCP Secure
Edge Node** (Tailscale exit + ProtonVPN egress + WireGuard), all monitored by the
collector.

**Two tracks, run in parallel:**
- **Track A — Software** (this repo): collector, data model, detection, dashboard,
  Copilot, flags.
- **Track B — Device/Edge ops** (mostly outside the repo): Quest sideload, GCP edge
  node, ProtonVPN egress, WireGuard. Produces docs + asset records in the repo.

**Confirmed decisions:** Go collector · bearer→mTLS portal↔collector auth · Claude
(Anthropic) Copilot with full identifier tokenization · official signature-verified
Quest Tailscale APK · scan allowlist `192.168.12.0/24` + `100.64.0.0/10` · GCP
`e2-micro` `us-central1` Ubuntu 24.04 · ProtonVPN WireGuard egress w/ NetShield ·
Edge Node v1 minimal.

**Non-negotiables (from spec):** privilege separation; all new flags default off;
bounded scanning (reuse `router-host` validators); AI read-only; local-first data;
no secrets in git or AI inputs; full audit trail.

---

## Tech stack

Go 1.22+ (collector), SQLite, `nmap`/`arp`/mDNS, Next.js 15 portal (existing),
Anthropic API (Copilot), Docker Compose, Tailscale, WireGuard, ProtonVPN (WireGuard
config), GCP Compute Engine.

## File structure

- Create: `collector/` — Go module (`main.go`, `internal/{scan,dns,vpn,store,api,detect}`).
- Create: `collector/Dockerfile`, `collector/migrations/*.sql`.
- Modify: `docker-compose.yml`, `docker-compose.tailscale.yml` — add `collector` service (internal network, own volume, scan capability).
- Create: `src/lib/collector-client.ts` — authed portal→collector client.
- Create: `src/app/api/security/*` — portal API proxying collector (assets, findings, ack, copilot).
- Create: `src/app/(dashboard)/security/page.tsx` — security dashboard.
- Create: `src/lib/copilot/*` — read-only AI Copilot tools + redaction.
- Modify: `src/lib/config-server.ts`, `config-client.ts`, `capabilities/route.ts` — new flags.
- Modify: `src/lib/audit-logger.ts` — rotation + configurable path.
- Create: `docs/edge-node.md`, `docs/quest-tailscale.md` — Track B runbooks.
- Create: `infra/edge-node/` — cloud-init / setup scripts for the GCP node (no secrets).

---

## Track B — Device & Edge ops (start here for an early win)

### Task B1: Sideload Tailscale on the Quest

- [ ] Fetch the **official** Tailscale Android APK from Tailscale's published source; record version + verify checksum/signature.
- [ ] `adb devices` → confirm the Quest; `adb install <apk>`; launch and sign into the tailnet.
- [ ] Confirm the Quest appears as a tailnet node; note its 100.x IP.
- [ ] **Harden**: document enabling ADB-over-Wi-Fi only when developing; turn it off after. (Collector will flag 5555.)
- [ ] Write `docs/quest-tailscale.md` (procedure + hardening) and add the Quest to the seed asset inventory (trusted).

### Task B2: Provision the GCP Secure Edge Node

- [ ] Create `e2-micro` Ubuntu 24.04 in `us-central1` (free-tier). GCP firewall: deny all public inbound.
- [ ] Install Tailscale; join tailnet; enable as **subnet router + exit node**; approve routes in admin.
- [ ] Lock SSH to Tailscale only (no public 22). Enable unattended security updates.
- [ ] `infra/edge-node/` cloud-init script (no secrets) + `docs/edge-node.md` runbook.
- [ ] Add the edge node as an asset + Shodan-exposure target.

### Task B3: ProtonVPN egress on the edge node

- [ ] Generate Proton **WireGuard** config (NetShield on; Port Forwarding off) — done by you in Proton's dashboard; key handled as a secret, never committed.
- [ ] Apply egress on the node with a **kill-switch** (fail closed; no leak to the raw GCP IP if Proton drops).
- [ ] Verify: node's public egress IP is ProtonVPN's, and drops to no-egress if the tunnel fails.

### Task B4: Self-hosted WireGuard server on the edge node

- [ ] Stand up WireGuard server reachable **over Tailscale only** (no public UDP/51820).
- [ ] Config generator: per-device configs; private keys on-device where possible; server stores only public keys; configs treated as secrets.
- [ ] Document add/remove-peer procedure in `docs/edge-node.md`.

---

## Track A — Software (collector + portal)

### Task A1: Collector scaffold + data model

- [ ] Go module under `collector/`; HTTP server; SQLite store; `migrations/` for the schema (assets, services, observations, findings, baselines, acknowledgements, scan_runs).
- [ ] Config via env (scan allowlist, bind addr, bearer token); allowlist defaults to `192.168.12.0/24` + `100.64.0.0/10`; **reject any public IP** (port the `router-host` logic).
- [ ] `collector/Dockerfile`; add `collector` service to both compose files (internal network, own volume, scan capability; document macOS no-host-network limitation).
- [ ] Unit tests for store + allowlist.

### Task A2: LAN discovery scan

- [ ] Implement controlled discovery: `nmap` (rate/concurrency-limited) + ARP + mDNS over the allowlist only.
- [ ] Persist a `scan_run` + observations; upsert assets/services.
- [ ] Manual trigger endpoint (authed) + scheduled interval (flag-gated, off by default).
- [ ] Tests with recorded fixtures (no live scanning in CI).

### Task A3: Collector API + portal client

- [ ] Collector REST: `GET /assets`, `/findings`, `GET /findings/{id}`, `POST /findings/{id}/ack`, `GET /baselines`, `POST /scan`. Bearer-token auth; structured errors.
- [ ] `src/lib/collector-client.ts` + `src/app/api/security/*` portal routes (auth via existing middleware; rate-limited; audit-logged).
- [ ] (Stretch) upgrade portal↔collector to mTLS on the internal network.

### Task A4: Detection, baselines, findings

- [ ] Seed baselines from the roadmap port taxonomy (expected scope/risk).
- [ ] Rules: new device, new listener, scope escalation, DNS drift, VPN failure, Shodan-exposure change, high-signal ports (incl. **Quest ADB 5555**).
- [ ] Dedupe → findings with severity, evidence (observation ids), recommendation, state machine (open/ack/resolved).
- [ ] Tests per rule.

### Task A5: DNS posture + VPN-health monitoring

- [ ] DNS checks (A/AAAA/MX/TXT/SPF/DKIM/DMARC) for configured owned domains → DNS-drift findings. Flag `ENABLE_DNS_MONITORING`.
- [ ] VPN-health: Tailscale peer state, WireGuard handshake age, ProtonVPN tunnel liveness on the edge node → findings. Flag `ENABLE_VPN_MONITORING`.

### Task A6: Security dashboard (portal UI)

- [ ] `src/app/(dashboard)/security/page.tsx`: assets table, findings list (severity/state filters), finding detail with evidence links, acknowledge/resolve actions, manual-scan button.
- [ ] Add nav entry; gate behind `ENABLE_LAN_DISCOVERY`.

### Task A7: Read-only AI Copilot

- [ ] `src/lib/copilot/*`: Anthropic client; **read-only tools only** (`list_findings`, `get_finding`, `get_asset`, `get_baseline`, `recommend_next_actions`) — no scan/write/shell tool exists.
- [ ] **Redaction layer**: tokenize all IPs/MACs/hostnames before model calls; map back only in the UI.
- [ ] Responses must cite finding/observation ids (evidence-grounded).
- [ ] Flag `ENABLE_AI_COPILOT` (default off); requires `ANTHROPIC_API_KEY`; clean "unavailable" state when absent.
- [ ] Tests: tool surface is read-only; redaction round-trips; no raw identifiers in outbound payloads.

### Task A8: Flags, capabilities, audit hardening

- [ ] Add `ENABLE_LAN_DISCOVERY`, `ENABLE_DNS_MONITORING`, `ENABLE_VPN_MONITORING`, `ENABLE_AI_COPILOT` to `config-server.ts` (default false) + advertise in `capabilities/route.ts`.
- [ ] Harden `audit-logger.ts`: size cap/rotation + configurable path; use it for collector-action proxying too.
- [ ] README + `.env.example` updates for all new flags/vars.

---

## Acceptance criteria

Per the spec's "Acceptance criteria (Release 1)". In brief: collector separate &
portal unprivileged; a re-scan surfaces new-device/new-listener findings with
evidence + ack/resolve; DNS + VPN-health produce findings; Copilot is read-only,
evidence-citing, off by default, and leaks no raw identifiers; all four flags
default off (portal behaves exactly as today when off); Quest on tailnet as a
trusted asset with ADB-5555 flagged; edge node up with ProtonVPN egress
(fail-closed) + WireGuard reachable only via Tailscale; no secret in git/AI inputs;
existing tests pass + new logic tested; CI green.

## Suggested sequencing

1. **B1 (Quest sideload)** — fast hands-on win.
2. **A1 (collector scaffold + model)** — unblocks everything in Track A.
3. **B2 (edge node)** in parallel with **A2 (discovery)**.
4. **A3 → A4** (API + detection), then **B3/B4** (Proton egress + WireGuard).
5. **A5 (DNS/VPN-health)** ties B3/B4 into findings.
6. **A6 (dashboard)** → **A7 (Copilot)** → **A8 (flags/audit/docs)**.

## Out of scope (later releases)

Workspace/remote-desktop, automated remediation, network profiles, push alerting,
the broader edge-node service catalog (CrowdSec/Grafana/Authentik/MQTT/etc.),
external SIEM, renaming compatibility-sensitive env vars/API paths.
