import type { Metadata } from "next"
import { ResetPasswordForm } from "@/components/auth/auth-forms"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Choose a new password",
  "Set a new password for your Dev Host account.",
)

export default function ResetPasswordPage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-xs text-muted-foreground">
          Pick something you have not used before.
        </p>
      </div>
      {/* TODO-AUTH: read the reset token from the URL (?token=) and pass it to the form. */}
      <ResetPasswordForm />
    </div>
  )
}
