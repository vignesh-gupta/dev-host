import {
  ECSClient,
  LaunchType,
  RunTaskCommand,
  StopTaskCommand,
} from "@aws-sdk/client-ecs"

export interface QueueBuildInput {
  projectId: string
  projectSlug: string
  framework: string
  deploymentId: string
  repoUrl: string
  branch: string
  /** Pin the build to an exact commit (used by redeploys). */
  commitSha?: string | null
  installCommand: string
  buildCommand: string
  outputDir: string
  /** User-defined build variables; passed as one JSON blob so they cannot clobber system variables. */
  envVars: { key: string; value: string }[]
}

function getCsvEnv(name: string): string[] | undefined {
  const value = process.env[name]
  if (!value) return undefined

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  return items.length ? items : undefined
}

function getLaunchType(): LaunchType {
  const launchType = process.env.ECS_LAUNCH_TYPE ?? LaunchType.FARGATE

  if (launchType === LaunchType.EC2) return LaunchType.EC2
  if (launchType === LaunchType.EXTERNAL) return LaunchType.EXTERNAL
  if (launchType === LaunchType.FARGATE) return LaunchType.FARGATE
  if (launchType === LaunchType.MANAGED_INSTANCES) {
    return LaunchType.MANAGED_INSTANCES
  }

  throw new Error(`Unsupported ECS_LAUNCH_TYPE: ${launchType}`)
}

function ecsClient() {
  return new ECSClient({
    endpoint: process.env.AWS_ENDPOINT_URL ?? "http://localhost:4566",
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
    },
  })
}

const cluster = () => process.env.ECS_CLUSTER ?? "default"

/** Starts the builder container for a deployment and returns its task ARN. */
export async function queueBuild(input: QueueBuildInput): Promise<string> {
  const taskDefinition =
    process.env.ECS_TASK_DEFINITION ?? "builder-server-task"
  const containerName = process.env.ECS_CONTAINER_NAME ?? "builder-server"
  const subnets = getCsvEnv("ECS_VPC_SUBNETS")
  const securityGroups = getCsvEnv("ECS_SECURITY_GROUPS")

  const environment = [
    { name: "GIT_REPOSITORY__URL", value: input.repoUrl },
    { name: "GIT_BRANCH", value: input.branch },
    { name: "PROJECT_ID", value: input.projectId },
    { name: "PROJECT_SLUG", value: input.projectSlug },
    { name: "FRAMEWORK", value: input.framework },
    { name: "DEPLOYMENT_ID", value: input.deploymentId },
    { name: "INSTALL_COMMAND", value: input.installCommand },
    { name: "BUILD_COMMAND", value: input.buildCommand },
    { name: "OUTPUT_DIR", value: input.outputDir },
    ...(process.env.LAMBDA_EXECUTION_ROLE_ARN
      ? [
          {
            name: "LAMBDA_EXECUTION_ROLE_ARN",
            value: process.env.LAMBDA_EXECUTION_ROLE_ARN,
          },
        ]
      : []),
    {
      name: "LAMBDA_S3_BUCKET",
      value: process.env.AWS_BUCKET_NAME ?? "simple-vercel-output",
    },
    { name: "BUILD_ENV_JSON", value: JSON.stringify(input.envVars) },
    ...(input.commitSha
      ? [{ name: "GIT_COMMIT_SHA", value: input.commitSha }]
      : []),
  ]

  const result = await ecsClient().send(
    new RunTaskCommand({
      cluster: cluster(),
      taskDefinition,
      launchType: getLaunchType(),
      count: 1,
      ...(subnets
        ? {
            networkConfiguration: {
              awsvpcConfiguration: {
                subnets,
                securityGroups,
                assignPublicIp: "ENABLED",
              },
            },
          }
        : {}),
      overrides: {
        containerOverrides: [{ name: containerName, environment }],
      },
    })
  )

  if (result.failures?.length) {
    const reason = result.failures
      .map((failure) => failure.reason ?? failure.detail ?? failure.arn)
      .filter(Boolean)
      .join(", ")
    throw new Error(
      `Failed to run builder task: ${reason || "unknown ECS failure"}`
    )
  }

  const taskArn = result.tasks?.[0]?.taskArn
  if (!taskArn) throw new Error("ECS did not return a task ARN")
  return taskArn
}

/** Best-effort stop of a running builder task. */
export async function stopBuild(taskArn: string, reason = "Canceled by user") {
  await ecsClient().send(
    new StopTaskCommand({ cluster: cluster(), task: taskArn, reason })
  )
}
