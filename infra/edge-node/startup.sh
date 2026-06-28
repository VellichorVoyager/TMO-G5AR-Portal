#!/usr/bin/env bash
# Metameros Secure Edge Node — first-boot setup (no secrets).
# Installs Tailscale, enables exit-node forwarding, and turns on unattended
# security updates. Tailscale authentication is done interactively afterward
# (`sudo tailscale up ...`) so no auth key is ever baked into metadata.
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ufw unattended-upgrades

# Unattended security updates
dpkg-reconfigure -f noninteractive unattended-upgrades || true

# IP forwarding (required for Tailscale subnet router / exit node)
cat >/etc/sysctl.d/99-tailscale.conf <<'EOF'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
EOF
sysctl -p /etc/sysctl.d/99-tailscale.conf

# Tailscale (official install script)
curl -fsSL https://tailscale.com/install.sh | sh

# Host firewall: default-deny inbound; allow loopback + established + Tailscale.
# Admin access is via Tailscale SSH, not public SSH. (We keep GCP's SSH path
# only until Tailscale SSH is confirmed, then remove it at the cloud firewall.)
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow in on tailscale0
ufw allow 41641/udp           # Tailscale direct connections
ufw allow 22/tcp              # temporary; removed once Tailscale SSH works
ufw --force enable

echo "edge-node startup complete: $(date -u)"
