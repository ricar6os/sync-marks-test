import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server"
import type { Metadata } from "next"
import { Instrument_Sans, JetBrains_Mono } from "next/font/google"

import "./globals.css"

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
})

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Bookmark Sync",
  description: "Cross-browser bookmark sync powered by Convex.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} app-shell`}>
        <ConvexAuthNextjsServerProvider>{children}</ConvexAuthNextjsServerProvider>
      </body>
    </html>
  )
}
