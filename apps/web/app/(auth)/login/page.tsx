import type { Metadata } from "next"
import Link from "next/link"
import { LoginForm } from "@/components/auth/auth-forms"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Sign in",
  "Sign in to manage your Dev Host projects and deployments.",
)

export default function LoginPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">Sign in</h1>
        <p className="text-xs text-muted-foreground">Welcome back.</p>
      </div>
      <LoginForm />
      <p className="text-center text-xs text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="text-foreground underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </div>
  )
}
