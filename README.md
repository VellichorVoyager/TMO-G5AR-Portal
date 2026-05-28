# TMO-G5AR Portal

![Release](https://img.shields.io/github/v/release/VellichorVoyager/TMO-G5AR-Portal)
![CodeQL](https://github.com/VellichorVoyager/TMO-G5AR-Portal/actions/workflows/codeql.yml/badge.svg)
![License](https://img.shields.io/github/license/VellichorVoyager/TMO-G5AR-Portal)

A modern web admin interface for the T-Mobile Arcadyan G5AR 5G Gateway, built with Next.js and shadcn/ui.

[![GitHub](https://img.shields.io/badge/GitHub-rchen14b-181717?style=flat&logo=github)](https://github.com/rchen14b/TMO-G5AR-Portal)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/rchen14b)

## Screenshots

### Dashboard
Real-time gateway status with 5G signal metrics, connection details, and device overview.

![Dashboard](docs/screenshots/screenshot_dashboard.png)

### Cell Information
Detailed 5G cellular metrics with signal quality sparklines, tower information, and SIM details.

![Cell Info](docs/screenshots/screenshot_cell_info.png)

### Connected Devices
View all devices connected to your network with IP/MAC addresses and signal strength.

![Devices](docs/screenshots/screenshot_devices.png)

### WiFi Settings
Manage your wireless networks across 2.4GHz, 5GHz, and 6GHz bands.

![WiFi](docs/screenshots/screenshot_wifi.png)

### System
Gateway information, system status, and quick actions like reboot.

![System](docs/screenshots/screenshot_system.png)

## Features

- **Dashboard** - Real-time signal strength gauges (RSRP/RSRQ/SINR), connection status, uptime
- **Connected Devices** - View all clients with names, IPs, MAC addresses, and signal strength
- **WiFi Settings** - Manage SSID, password, and band configurations (2.4GHz, 5GHz, 6GHz)
- **Cell Info** - Detailed 5G metrics including tower ID, band info (n41), and GPS coordinates
- **SIM Info** - ICCID, IMEI, IMSI details
- **System Controls** - Reboot gateway, view device info and firmware version

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **React**: React 19
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Data Fetching**: SWR for real-time updates
- **Icons**: Lucide React

## Router API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /TMI/v1/auth/login` | No | Authenticate, returns JWT token |
| `GET /TMI/v1/version` | No | API version |
| `GET /TMI/v1/gateway?get=all` | No | Device info, signal summary, uptime |
| `GET /TMI/v1/gateway?get=signal` | No | Signal info only |
| `GET /TMI/v1/network/telemetry?get=cell` | Yes | 5G signal metrics |
| `GET /TMI/v1/network/telemetry?get=clients` | Yes | Connected devices |
| `GET /TMI/v1/network/telemetry?get=sim` | Yes | SIM card info |
| `GET /TMI/v1/network/configuration/v2?get=ap` | Yes | WiFi AP settings |
| `POST /TMI/v1/network/configuration/v2?set=ap` | Yes | Update WiFi settings |
| `POST /TMI/v1/gateway/reset?set=reboot` | Yes | Reboot gateway |

## Getting Started

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the portal.

Login with your gateway credentials (found on the label of your device). The default username is `admin` and the default gateway IP is `192.168.12.1`.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REQUEST_TIMEOUT_MS` | `5000` | Timeout used by gateway proxy requests (`routerFetch`) |
| `NEXT_PUBLIC_POLL_INTERVAL_FAST` | `5000` | Fast polling interval used by client SWR hooks; client polling only reads this public variable |
| `NEXT_PUBLIC_POLL_INTERVAL_SLOW` | `30000` | Slow polling interval used by client SWR hooks; client polling only reads this public variable |
| `NEXT_PUBLIC_REVALIDATE_ON_FOCUS` | `false` | Enables/disables SWR `revalidateOnFocus` behavior for polling hooks |
| `ALLOW_CUSTOM_GATEWAY_HOST` | `false` | Keeps gateway host pinned to `192.168.12.1` unless custom private hosts are explicitly enabled/allowlisted |
| `GATEWAY_ALLOWED_HOSTS` | _(empty)_ | Comma-separated router host allowlist (IPv4 or explicit hostnames); invalid entries are ignored with a warning |
| `COOKIE_SECURE` | `false` | Sets `Secure` flag on auth/router cookies |
| `COOKIE_SAMESITE` | `strict` | Sets `SameSite` on auth/router cookies (`strict`, `lax`, `none`); `none` forces `Secure=true` |
| `ENABLE_WRITE_ACTIONS` | `false` | Blocks mutation API routes (`/api/router/reboot`, `/api/router/ap`) when disabled |

Gateway access is now safe-by-default: only `192.168.12.1` is accepted unless you explicitly configure `GATEWAY_ALLOWED_HOSTS` and/or `ALLOW_CUSTOM_GATEWAY_HOST`.

## Docker

### Prerequisites

Make sure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is installed and running before proceeding.

### Build

```bash
docker buildx build -t g5ar-portal .
```

### Run

**Linux:**
```bash
docker run --network host g5ar-portal
```

**macOS/Windows:** Docker Desktop doesn't support `--network host`. Use port mapping instead:
```bash
docker run -p 3000:3000 g5ar-portal
```

Access the portal at [http://localhost:3000](http://localhost:3000).

### Docker Compose

**Linux** (`docker-compose.yml`):
```yaml
services:
  g5ar-portal:
    build: .
    network_mode: host
    restart: unless-stopped
```

**macOS/Windows** (`docker-compose.yml`):
```yaml
services:
  g5ar-portal:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
```

Then run:

```bash
docker compose up -d
```

## Safe Deployment Notes

This portal is intended for local or trusted-network use. Do not expose it directly to the public internet.

Recommended deployment patterns:

* Run the portal locally on your LAN whenever possible.
* Keep `ENABLE_WRITE_ACTIONS=false` unless router mutations are intentionally needed.
* Use read-only mode for monitoring-only deployments.
* Keep gateway credentials and `.env.local` files private.
* Restrict custom gateway targets with `GATEWAY_ALLOWED_HOSTS`.
* Leave `ALLOW_CUSTOM_GATEWAY_HOST=false` unless you explicitly need a custom private gateway host.
* Place any remote access behind a trusted access layer such as Tailscale, WireGuard, Cloudflare Access, or another zero-trust gateway.
* Do not publish router credentials, session cookies, local network details, or gateway screenshots containing sensitive identifiers.

Security-sensitive routes are designed to be safe-by-default. Mutation routes such as reboot and WiFi configuration updates are blocked unless write actions are explicitly enabled through server-side configuration.


## Project Structure

```
src/
├── app/
│   ├── api/router/       # API routes proxying to gateway
│   ├── (dashboard)/      # Main dashboard page
│   ├── devices/          # Connected devices page
│   ├── wifi/             # WiFi settings page
│   ├── cell/             # Cell/5G info page
│   └── system/           # System controls page
├── components/
│   ├── ui/               # shadcn/ui components
│   ├── signal-gauge.tsx  # Signal strength visualization
│   ├── device-table.tsx  # Connected devices table
│   └── ...
├── lib/
│   ├── router-api.ts     # Router API client
│   └── utils.ts          # Utility functions
└── hooks/
    └── use-router-data.ts # SWR hooks for router data
```

## License

MIT
