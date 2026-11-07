import type { Metadata } from "next"
import { Features } from "@/components/landing/features"
import { Closing, LogsSection } from "@/components/landing/closing"
import { Hero } from "@/components/landing/hero"
import { LandingNav } from "@/components/landing/pill-nav"
import { PipelineStory } from "@/components/landing/pipeline-story"
import { siteDescription, siteName, socialImage } from "@/lib/seo"

export const metadata: Metadata = {
  title: { absolute: "Dev Host — push to Git, we host it" },
  description: siteDescription,
  alternates: { canonical: "/" },
  openGraph: {
    title: "Dev Host — push to Git, we host it",
    description: siteDescription,
    siteName,
    type: "website",
    url: "/",
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dev Host — push to Git, we host it",
    description: siteDescription,
    images: [socialImage.url],
  },
}

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <PipelineStory />
        <LogsSection />
        <Features />
        <Closing />
      </main>
    </>
  )
}
