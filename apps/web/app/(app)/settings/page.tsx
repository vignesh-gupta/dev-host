import type { Metadata } from "next"
import { SettingsView } from "@/components/settings/settings-view"
import { createPageMetadata } from "@/lib/seo"

export const metadata: Metadata = createPageMetadata(
  "Settings",
  "Manage your Dev Host account and workspace preferences.",
)

export default function SettingsPage() {
  return <SettingsView />
}
