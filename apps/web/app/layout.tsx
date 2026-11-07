import type { Metadata } from "next"
import "@dev-hoster/ui/globals.css"
import { Providers } from "@/components/providers"
import { siteDescription, siteName, siteUrl, socialImage } from "@/lib/seo"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteName, template: `%s · ${siteName}` },
  description: siteDescription,
  applicationName: siteName,
  authors: [{ name: "Vignesh Gupta" }],
  creator: "Vignesh Gupta",
  keywords: [
    "Git deployment",
    "Next.js hosting",
    "static site hosting",
    "continuous deployment",
  ],
  openGraph: {
    title: siteName,
    description: siteDescription,
    siteName,
    type: "website",
    locale: "en_US",
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: [socialImage.url],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
