import type { Metadata } from "next"

export const siteName = "Dev Host"
export const siteDescription =
  "Connect a Git repository and Dev Host builds, deploys, and hosts it for you. Next.js and static sites, live on every push."
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
export const socialImage = {
  url: "/thumbnail.png",
  alt: "Dev Host — push to Git, we host it",
}

export function createPageMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
  }
}
