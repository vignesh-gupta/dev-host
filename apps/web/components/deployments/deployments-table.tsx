"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Skeleton } from "@dev-hoster/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@dev-hoster/ui/components/table"
import { GitBranch } from "lucide-react"
import { shortSha } from "@/lib/format"
import type { DeploymentWithProject } from "@/lib/types"
import { Duration } from "@/components/deployments/duration"
import { LiveBadge } from "@/components/deployments/live-badge"
import { StatusBadge } from "@/components/status-badge"
import { TimeAgo } from "@/components/time-ago"

export function deploymentHref(d: Pick<DeploymentWithProject, "slug" | "project">) {
  return `/projects/${d.project.slug}/deployments/${d.slug}`
}

export function DeploymentsTable({
  deployments,
  showProject = false,
  loading = false,
}: {
  deployments?: DeploymentWithProject[]
  showProject?: boolean
  loading?: boolean
}) {
  const router = useRouter()

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-3">Deployment</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead className="hidden md:table-cell">Branch</TableHead>
          <TableHead className="hidden lg:table-cell">Duration</TableHead>
          <TableHead className="pr-3 text-right">Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading &&
          Array.from({ length: 4 }, (_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell className="pl-3">
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16" />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <Skeleton className="h-4 w-10" />
              </TableCell>
              <TableCell className="pr-3">
                <Skeleton className="ml-auto h-4 w-14" />
              </TableCell>
            </TableRow>
          ))}
        {deployments?.map((d) => {
          const href = deploymentHref(d)
          return (
            <TableRow
              key={d.id}
              className="cursor-pointer"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a,button")) return
                router.push(href)
              }}
            >
              <TableCell className="max-w-0 pl-3 md:max-w-[22rem]">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Link
                      href={href}
                      prefetch={false}
                      className="font-mono font-medium underline-offset-2 hover:underline focus-visible:underline"
                    >
                      {d.slug}
                    </Link>
                    {showProject && (
                      <span className="truncate text-muted-foreground">
                        {d.project.name}
                      </span>
                    )}
                    {d.isActive && <LiveBadge />}
                  </div>
                  <span className="truncate text-muted-foreground">
                    {d.commitMessage ?? shortSha(d.commitSha)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={d.status} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {d.deploymentType}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                  <GitBranch aria-hidden className="size-3" />
                  {d.branch ?? "—"}
                </span>
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                <Duration start={d.startedAt} end={d.finishedAt} />
              </TableCell>
              <TableCell className="pr-3 text-right text-muted-foreground">
                <TimeAgo iso={d.createdAt} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
