# Metameros Secure Edge Node (GCP) — Runbook

The cloud node that provides **VPN egress** (Tailscale exit node → ProtonVPN) and a
self-hosted **WireGuard** server. It does **not** host the gateway portal (that must
stay on the home LAN). See the design spec under `docs/superpowers/specs/`.

## What's provisioned

- **VM**: `metameros-edge`, project `project-d4028d19-8f2d-46bd-832`, zone
  `us-central1-a`, `e2-micro`, Ubuntu 24.04, 30 GB pd-standard.
- **External IP**: `108.59.84.128` (ephemeral).
- **Startup script** (`infra/edge-node/startup.sh`, no secrets) already ran:
  installed Tailscale, enabled IPv4/IPv6 forwarding (for exit/subnet routing),
  enabled unattended security updates, and a default-deny `ufw` (allows `tailscale0`,
  `41641/udp`, and temporarily `22/tcp`).
- OS Login is enabled on the instance.

## Access

Preferred: **GCP Console → Compute Engine → VM instances → `metameros-edge` → SSH**
(in-browser; most reliable). CLI `gcloud compute ssh metameros-edge --zone=us-central1-a`
can hit OS Login key-propagation issues from some environments.

## Step 1 — Join the tailnet (interactive; do this first)

In the VM shell:

```bash
sudo tailscale up --ssh --advertise-exit-node --accept-dns=false
```

- Open the printed `https://login.tailscale.com/...` URL in your browser.
- **Authenticate and pick the `kite-magellanic` tailnet** (not a personal one).
- In the **Tailscale admin console**: approve the new machine, and enable it as an
  **exit node** (Machines → metameros-edge → Edit route settings → Use as exit node).

Verify from home (no SSH to the VM needed):

```bash
docker exec metameros-tailscale tailscale status | grep -i edge
```

`metameros-edge` should appear as a peer.

> Note: `--advertise-exit-node` is set now for convenience, but **don't route your
> devices through it until Step 2 is done** — until ProtonVPN egress is configured,
> exit traffic would leave via the raw GCP IP, not Proton.

## Step 2 — ProtonVPN egress (your secret config; kill-switch)

1. In the **Proton account dashboard**, generate a **WireGuard** config for a server
   you want as your exit, with **NetShield enabled** (Port Forwarding off). Download
   the `.conf`. Treat it as a secret — never commit it.
2. On the VM:
   ```bash
   sudo apt-get install -y wireguard
   sudo install -m600 /dev/stdin /etc/wireguard/proton.conf   # paste config, Ctrl-D
   sudo systemctl enable --now wg-quick@proton
   ```
3. **Kill-switch** (fail closed — no leak to the raw GCP IP if Proton drops): add a
   firewall mark/route policy or `PostUp`/`PostDown` rules so non-Proton egress is
   dropped. (We'll finalize the exact ruleset together.)
4. Verify the VM's public egress IP is ProtonVPN's:
   ```bash
   curl -s https://api.ipify.org ; echo
   ```

## Step 3 — Self-hosted WireGuard server (reachable via Tailscale only)

Stand up a WireGuard server for devices not on Tailscale; **do not** open UDP/51820
publicly — reach it over the tailnet. Config generator + add/remove-peer steps to be
finalized.

## Step 4 — Lock down

- Once Tailscale SSH works, remove public SSH: tighten the GCP firewall / `ufw delete
  allow 22/tcp` and rely on `tailscale ssh metameros-edge`.
- Confirm no public inbound ports remain (the node is itself a monitored asset and a
  Shodan-exposure target).

## Cost

`e2-micro` in `us-central1` is free-tier eligible; the ephemeral external IPv4 is
~$3–4/mo (covered by your GCP credits). The $1,000 GenAI credit does **not** apply to
Compute Engine.
