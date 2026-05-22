import type { Metadata, Viewport } from "next"
import { Figtree, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { OfflineBanner } from "@/components/OfflineBanner"
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration"
import "./globals.css"

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "alibi — for the days you can't see clearly",
  description:
    "Alibi is a witness with a warm voice. Log what you did, then let it reflect your productivity patterns back clearly.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Alibi",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8faff",
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${figtree.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <OfflineBanner />
        <ServiceWorkerRegistration />
        <Analytics />
      </body>
    </html>
  )
}
