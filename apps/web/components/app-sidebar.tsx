"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@dev-hoster/ui/components/sidebar"
import { Skeleton } from "@dev-hoster/ui/components/skeleton"
import {
  Avatar,
  AvatarFallback,
} from "@dev-hoster/ui/components/avatar"
import {
  FolderGit2,
  LayoutDashboard,
  Rocket,
  Settings,
} from "lucide-react"
import { useMe, useProjects } from "@/lib/api/hooks"
import { LogoMark } from "@/components/logo"
import { ProjectAvatar } from "@/components/project-avatar"
import { ThemeToggle } from "@/components/theme-toggle"

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderGit2 },
  { href: "/deployments", label: "Deployments", icon: Rocket },
]

export function AppSidebar() {
  const pathname = usePathname()
  const projects = useProjects()
  const me = useMe()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <LogoMark />
              <span className="font-semibold tracking-tight">Dev Host</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV.map(({ href, label, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  tooltip={label}
                  isActive={isActive(href)}
                  render={<Link href={href} />}
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recent projects</SidebarGroupLabel>
          <SidebarMenu>
            {projects.isPending &&
              Array.from({ length: 3 }, (_, i) => (
                <SidebarMenuItem key={i}>
                  <div className="flex h-8 items-center gap-2 px-2">
                    <Skeleton className="size-4" />
                    <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${[62, 78, 50][i]}%` }} />
                  </div>
                </SidebarMenuItem>
              ))}
            {projects.data?.slice(0, 6).map((p) => (
              <SidebarMenuItem key={p.id}>
                <SidebarMenuButton
                  isActive={pathname.startsWith(`/projects/${p.slug}`)}
                  render={<Link href={`/projects/${p.slug}`} />}
                >
                  <ProjectAvatar name={p.name} className="size-4 text-[10px]" />
                  <span className="truncate">{p.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {projects.data?.length === 0 && (
              <p className="px-2 py-1 text-xs text-sidebar-foreground/60">
                No projects yet.
              </p>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              isActive={isActive("/settings")}
              render={<Link href="/settings" />}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ThemeToggle />
          </SidebarMenuItem>
          <SidebarMenuItem>
            {/* TODO-AUTH: turn this into a user menu (profile, sign out) once auth lands. */}
            <SidebarMenuButton
              size="lg"
              tooltip={me.data?.name ?? "Default User"}
              render={<Link href="/settings" />}
            >
              <Avatar className="size-6 rounded-none">
                <AvatarFallback className="rounded-none bg-primary/12 text-[10px] font-semibold text-accent-foreground dark:text-primary">
                  {(me.data?.name ?? "D").slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-xs font-medium">
                  {me.data?.name ?? "Default User"}
                </span>
                <span className="truncate text-[11px] text-sidebar-foreground/60">
                  Single-user mode
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
