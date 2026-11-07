import type { Metadata } from "next"
import { LinkButton } from "@/components/link-button"

export const metadata: Metadata = {
  title: "Page not found",
  description: "The requested Dev Host page could not be found.",
}

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-xs text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-xs text-xs/relaxed text-muted-foreground">
        That page does not exist, or the project behind it was deleted.
      </p>
      <LinkButton href="/dashboard">Back to dashboard</LinkButton>
    </div>
  )
}
