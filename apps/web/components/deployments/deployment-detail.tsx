"use client"

import { useRouter } from "next/navigation"
import { Button } from "@dev-hoster/ui/components/button"
import { Skeleton } from "@dev-hoster/ui/components/skeleton"
import { cn } from "@dev-hoster/ui/lib/utils"
import {
  ArrowUpRight,
  Check,
  CircleX,
  GitBranch,
  GitCommitHorizontal,
  Loader,
  Rocket,
  RotateCw,
  Square,
} from "lucide-react"
import { toast } from "sonner"
import {
  useCancelDeployment,
  useDeployment,
  usePromoteDeployment,
  useTriggerDeployment,
} from "@/lib/api/hooks"
import { formatDateTime, shortSha } from "@/lib/format"
import { isTerminalStatus, type Deployment } from "@/lib/types"
import { BuildLogViewer } from "@/components/deployments/build-log-viewer"
import { Duration } from "@/components/deployments/duration"
import { LiveBadge } from "@/components/deployments/live-badge"
import { CopyButton } from "@/components/copy-button"
import { ErrorState } from "@/components/error-state"
import { LinkButton } from "@/components/link-button"
import { PageHeader } from "@/components/page-header"
import { Section } from "@/components/section"
import { StatusBadge } from "@/components/status-badge"
import { TimeAgo } from "@/components/time-ago"

export function DeploymentDetail({
  slug,
  deploymentSlug,
}: {
  slug: string
  deploymentSlug: string
}) {
  const router = useRouter()
  const query = useDeployment(slug, deploymentSlug)
  const promote = usePromoteDeployment(slug, deploymentSlug)
  const cancel = useCancelDeployment(slug, deploymentSlug)
  const redeploy = useTriggerDeployment(slug)

  if (query.isError)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => query.refetch()}
        notFoundTitle="Deployment not found"
        backHref={`/projects/${slug}/deployments`}
        backLabel="All deployments"
      />
    )
  if (!query.data) return <DeploymentDetailSkeleton />

  const { project, deployment: d } = query.data
  const active = !isTerminalStatus(d.status)

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{d.slug}</span>
            <StatusBadge status={d.status} />
            <span className="rounded border px-2 py-0.5 font-mono text-xs">
              {d.deploymentType}
            </span>
            {d.isActive && <LiveBadge />}
          </span>
        }
        description={d.commitMessage ?? undefined}
        actions={
          <>
            {d.isActive && (
              <LinkButton href={project.url} external variant="outline">
                Visit <ArrowUpRight />
              </LinkButton>
            )}
            {d.status === "READY" && !d.isActive && (
              <Button
                disabled={promote.isPending}
                onClick={() =>
                  promote.mutate(undefined, {
                    onSuccess: () =>
                      toast.success(`${d.slug} is now live`, {
                        description: project.url,
                      }),
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                <Rocket /> Promote to live
              </Button>
            )}
            {active && (
              <Button
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() =>
                  cancel.mutate(undefined, {
                    onSuccess: () => toast("Build canceled"),
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                <Square /> Cancel build
              </Button>
            )}
            {!active && (
              <Button
                variant="outline"
                disabled={redeploy.isPending}
                onClick={() =>
                  redeploy.mutate(
                    { branch: d.branch ?? undefined, commitSha: d.commitSha ?? undefined },
                    {
                      onSuccess: (next) => {
                        toast.success("Redeploy queued", { description: next.slug })
                        router.push(`/projects/${slug}/deployments/${next.slug}`)
                      },
                      onError: (e) => toast.error(e.message),
                    }
                  )
                }
              >
                <RotateCw /> Redeploy
              </Button>
            )}
          </>
        }
      />

      <Section bodyClassName="grid grid-cols-2 gap-px bg-border md:grid-cols-4 [&>div]:bg-card">
        <Fact label="Branch">
          <span className="inline-flex items-center gap-1 font-mono">
            <GitBranch aria-hidden className="size-3 text-muted-foreground" />
            {d.branch ?? "—"}
          </span>
        </Fact>
        <Fact label="Commit">
          <span className="inline-flex items-center gap-1 font-mono">
            <GitCommitHorizontal aria-hidden className="size-3 text-muted-foreground" />
            {shortSha(d.commitSha)}
            {d.commitSha && <CopyButton value={d.commitSha} label="Copy commit SHA" />}
          </span>
        </Fact>
        <Fact label="Created">
          <TimeAgo iso={d.createdAt} />
        </Fact>
        <Fact label="Build time">
          <Duration start={d.startedAt} end={d.finishedAt} />
        </Fact>
        {d.deploymentType === "SSR" && d.lambdaUrl && (
          <Fact label="Lambda URL">
            <span className="inline-flex max-w-full items-center gap-1">
              <a
                href={d.lambdaUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate underline-offset-2 hover:underline"
              >
                {d.lambdaUrl}
              </a>
              <CopyButton value={d.lambdaUrl} label="Copy Lambda URL" />
            </span>
          </Fact>
        )}
      </Section>

      <Timeline d={d} />

      <BuildLogViewer deploymentId={d.id} status={d.status} />
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-xs">{children}</dd>
    </div>
  )
}

/** Queued → Building → Ready/Failed, each with its timestamp. */
function Timeline({ d }: { d: Deployment }) {
  const failed = d.status === "FAILED"
  const steps = [
    {
      label: "Queued",
      at: d.createdAt,
      state: "done" as const,
    },
    {
      label: "Building",
      at: d.startedAt,
      state: d.status === "QUEUED" ? ("pending" as const) : d.status === "BUILDING" ? ("current" as const) : ("done" as const),
    },
    {
      label: failed ? "Failed" : "Ready",
      at: d.finishedAt,
      state: isTerminalStatus(d.status) ? (failed ? ("failed" as const) : ("done" as const)) : ("pending" as const),
    },
  ]
  return (
    <ol
      aria-label="Deployment progress"
      className="grid grid-cols-3 border bg-card"
    >
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2.5",
            i > 0 && "border-l"
          )}
        >
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center",
              s.state === "done" && "bg-success/15 text-success",
              s.state === "current" && "bg-primary/15 text-accent-foreground dark:text-primary",
              s.state === "failed" && "bg-destructive/10 text-destructive",
              s.state === "pending" && "bg-muted text-muted-foreground"
            )}
          >
            {s.state === "done" && <Check aria-hidden className="size-3" />}
            {s.state === "current" && <Loader aria-hidden className="size-3 animate-spin" />}
            {s.state === "failed" && <CircleX aria-hidden className="size-3" />}
            {s.state === "pending" && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
          </span>
          <div className="min-w-0 leading-tight">
            <p className={cn("text-xs font-medium", s.state === "pending" && "text-muted-foreground")}>
              {s.label}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {s.at ? formatDateTime(s.at) : "—"}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function DeploymentDetailSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
