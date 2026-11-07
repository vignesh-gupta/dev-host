import type { Metadata } from "next"
import Link from "next/link"
import { ForgotPasswordForm } from "@/components/auth/auth-forms"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Reset your password",
  "Request a secure link to reset your Dev Host password.",
)

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">Reset your password</h1>
        <p className="text-xs text-muted-foreground">
          Enter your email and we will send a reset link.
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="text-foreground underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
