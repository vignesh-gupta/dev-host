import type { Metadata } from "next"
import Link from "next/link"
import { LogoMark } from "@/components/logo"

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

// TODO-AUTH: once auth is enforced, redirect already-signed-in users away from
// these pages (see lib/server/auth.ts).
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <LogoMark /> Dev Host
      </Link>
      <div className="w-full max-w-sm border bg-card p-5">{children}</div>
      <p className="max-w-sm text-center text-[11px]/relaxed text-muted-foreground">
        Sign-in is not enforced yet. These pages are ready for when it is.
      </p>
    </div>
  )
}
