# Design Notes: Security & Observability Platform (future)

> Status: **Future / exploratory** · Last updated: 2026-06-26

This captures the longer-term direction for evolving the G5AR Portal from a gateway
admin UI into a **network asset-discovery and baseline-monitoring** tool. It is a
backlog of ideas, not a committed plan. The shipped WAN exposure feature
([docs/shodan-exposure.md](shodan-exposure.md)) is the first slice of this vision.

## Guiding principle

Think in terms of **asset discovery + baseline monitoring**, not "dangerous ports."
The value is in tracking *what is normal* for this network and alerting on *change*,
with enough context that a finding is actionable rather than a raw port number.

LAN-side discovery (everything below except the Shodan/DNS/TLS items) requires a
local scanner component — `nmap`/`arp`/mDNS probing from a host on the LAN. The
portal can't see LAN services through the gateway API alone, and Shodan can only see
public IPs. So the bulk of this is a **separate local collector** feeding the portal,
distinct from the existing read-only gateway proxy.

## The service-inventory model (core idea)

Rather than a flat list of open ports, model each observed service as a record and
track it over time. This is the data model the whole platform should converge on:

| Attribute | Example |
|---|---|
| Device | MacBook Pro |
| Interface | Wi-Fi / Tailscale / USB tether |
| Port / Protocol | 5353 / UDP |
| Service | Bonjour |
| Process | ControlCenter |
| Scope | Loopback / LAN / VPN / Internet |
| First seen / Last seen | timestamps |
| State | Expected / New / Changed / Exposed |
| Risk | Low / Medium / High |
| Recommendation | "Expected on LAN only" |

This scales far better than a port scanner: it gives context, tracks drift, and
turns "port 5555 is open" into "ADB appeared on the Quest, previously unseen — High."

## Monitoring beyond ports

- **Shodan exposure** — already shipped for the gateway's public IP; extend to track
  history and diff over time.
- **Public IP change tracking** — especially valuable on cellular/CGNAT where the
  address rotates; trigger a re-check on change.
- **DNS posture** — watch A/AAAA/MX/TXT/SPF/DKIM/DMARC for owned domains.
- **TLS certificates** — issuance + expiry monitoring (CT-log style).
- **UPnP / NAT-PMP** — detect devices auto-creating port mappings on the gateway.
- **New listeners** — alert when a host starts listening on a previously unused port.
- **mDNS / Bonjour inventory** — what Apple devices and the Quest advertise on the LAN.
- **MAC address inventory** — trusted-device allowlist; flag unknown devices (the
  portal already lists connected clients — this is the alerting layer on top).
- **ARP change detection** — notify when new hardware joins.
- **VPN / overlay state** — Tailscale peers, Cloudflare Tunnel status, WireGuard sessions.
- **Threat-intel enrichment** — optional reputation lookups for public IPs/domains.

## Port baseline (reference categories)

A starting taxonomy for classifying observed services and assigning expected scope.
Used to seed the "Expected" state and risk defaults in the inventory model above.

1. **Critical remote access** (High if internet-reachable): 22 SSH, 23 Telnet,
   3389 RDP, 5900 VNC, 3283 ARD, 5985/5986 WinRM, 2222 alt-SSH.
2. **Apple ecosystem**: 5353 mDNS, 7000/7100 AirPlay, 62078 lockdown, 3689 DAAP,
   AirDrop dynamic high ports.
3. **Meta Quest / Android**: 5555 ADB-over-WiFi, 5037 ADB server, 8082 MQDH,
   27036/27037 Air Link, 9944 Oculus discovery.
4. **Windows**: 135 RPC, 137/138/139 NetBIOS, 445 SMB, 3389 RDP, 5357 WSD, 5985/5986 WinRM.
5. **Local dev**: 3000 React, 3001 Next.js, 5173/4173 Vite, 8000 Python, 8081 Metro,
   8501 Streamlit, 8888 Jupyter.
6. **Databases**: 5432 Postgres, 3306 MySQL, 27017 Mongo, 6379 Redis, 9200 Elastic,
   7474/7687 Neo4j, 8123 ClickHouse.
7. **Docker / containers**: 2375/2376 Docker, 5000 registry, 9090 Prometheus,
   9093 Alertmanager, 9091 Pushgateway.
8. **Kubernetes**: 6443 API, 10250/10255 kubelet, 30000-32767 NodePort.
9. **VPN / overlay**: 41641 Tailscale, 51820 WireGuard, 1194 OpenVPN, 7844 Cloudflare Tunnel.
10. **Web**: 80/443, 8080/8443.
11. **Mail**: 25/465/587 SMTP, 110/995 POP3, 143/993 IMAP.
12. **DNS**: 53 TCP/UDP, 853 DoT, 443 DoH, 5353 mDNS.
13. **IoT / smart home**: 1883/8883 MQTT, 1900 SSDP, 5683 CoAP, 5353 mDNS.
14. **AI / local LLM**: 11434 Ollama, 7860 Gradio, 8000 LLM APIs, 6333/6334 Qdrant,
    19530 Milvus, 8001 Chroma.
15. **Monitoring stack**: 3000 Grafana, 9090 Prometheus, 9100 node-exporter,
    9093 Alertmanager, 5601 Kibana.

## Shodan API extensions (from shodan-python)

Capabilities in the [shodan-python](https://github.com/achillean/shodan-python)
library/CLI not yet used by the portal, all reachable via Shodan's REST API:

- **Exploit search** (`/api/exploits` via exploits.shodan.io) — surface known exploits
  for products/CVEs found during exposure checks.
- **DNS DB** — domain/subdomain enumeration and DNS lookups for owned domains.
- **Streaming firehose** — real-time stream of Monitor alert events (vs. polling),
  to push alerts into the portal live.
- **Bulk host lookups** — efficient multi-IP enrichment if monitoring more than one
  public address.
- **Email notification management** — configure Shodan-side email triggers alongside
  the in-portal alert config already shipped.

## Architecture implications

- A **local collector** (separate process/container) does LAN discovery and writes to
  a small local store (SQLite/JSON), which the portal reads. Keep it optional and
  off by default, consistent with the repo's safe-by-default posture.
- Persist the service-inventory history locally; never ship it off-device without
  explicit opt-in (same redaction discipline as diagnostics export).
- Everything credit-spending or outbound stays gated behind explicit flags, as with
  the existing Shodan phases.
