# Roadmap

This roadmap tracks planned improvements for the TMO-G5AR Portal fork, with a focus on safe local administration, security hardening, reliability, and better operational visibility.

## Near Term

- Add or verify a stable CI workflow for builds, tests, and linting.
- Add README badges for release status, CI, and security policy.
- Improve safe deployment documentation for LAN-only and zero-trust remote access patterns.
- Confirm CodeQL, Dependabot, and secret scanning coverage where available.
- Keep dependency updates current through Dependabot.

## Security and Safety

- Maintain safe-by-default gateway host validation.
- Keep write actions disabled by default.
- Continue rejecting public, loopback, link-local, metadata, and ambiguous IPv4 targets.
- Add audit logging for sensitive write actions such as reboot and WiFi configuration changes.
- Document recommended Tailscale, WireGuard, or Cloudflare Access deployment patterns.
- Consider adding rate limiting for login and mutation endpoints.

## Reliability

- Improve error messaging for router connectivity and authentication failures.
- Add more regression tests for router host policy behavior.
- Add tests for cookie configuration and authentication edge cases.
- Add diagnostics export for troubleshooting gateway state without exposing secrets.

## User Experience

- Improve read-only mode visibility across the dashboard.
- Add clearer status indicators for write-disabled deployments.
- Add better loading and failure states for gateway polling.
- Consider historical signal charts for RSRP, RSRQ, SINR, and band changes.

## Future Ideas

- Add optional local-only audit log storage.
- Add a secure remote-access deployment guide.
- Add Docker Compose examples for LAN and zero-trust deployments.
- Add a lightweight diagnostics page.
- Explore support for additional T-Mobile gateway models if safe API compatibility can be confirmed.

## WAN Exposure (Shodan)

See [docs/shodan-exposure.md](docs/shodan-exposure.md) for the full design.

- [x] Phase 1: Exposure page using free, keyless Shodan InternetDB + CGNAT handling (no credits).
- [x] Phase 2: Optional `SHODAN_API_KEY` host lookup and audit-logged on-demand scans behind `ENABLE_SHODAN_SCAN`.
- [x] Phase 3: Shodan Monitor network alert management — create/delete alerts, enable/disable triggers (new ports, vulns, etc.) per-alert.
