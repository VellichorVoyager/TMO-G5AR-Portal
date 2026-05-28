import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "G5AR Portal - 5G Gateway Manager",
  description: "Modern web admin interface for Arcadyan G5AR 5G Gateway",
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  )
}
