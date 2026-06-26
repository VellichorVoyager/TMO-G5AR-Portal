/** @type {import('next').NextConfig} */

// Security headers for this admin panel. frame-ancestors/X-Frame-Options stop
// clickjacking (important — this UI can reboot the gateway). The CSP keeps
// 'unsafe-inline'/'unsafe-eval' for scripts because Next.js hydration and chart
// libs need them without a nonce pipeline; everything else is locked to self.
// connect-src allows the Cloudflare speed-test endpoint used by /speedtest.
const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://speed.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
]

const nextConfig = {
  output: "standalone",
  // Ensure images from public folder work in standalone mode
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

module.exports = nextConfig
