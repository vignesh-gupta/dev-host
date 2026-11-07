const {
  CreateFunctionCommand,
  CreateFunctionUrlConfigCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionConfigurationCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionUrlConfigCommand,
  waitUntilFunctionActiveV2,
} = require("@aws-sdk/client-lambda")

function lambdaClient() {
  return new LambdaClient({
    endpoint: process.env.AWS_ENDPOINT_URL || "http://host.docker.internal:4566",
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    },
  })
}

function functionName(projectId, deploymentId) {
  return `devhoster-${projectId}-${deploymentId}`.slice(0, 64)
}

async function deployLambda({
  projectId,
  deploymentId,
  s3Bucket,
  s3Key,
  environment = {},
}) {
  const environmentBytes = Buffer.byteLength(JSON.stringify(environment), "utf8")
  if (environmentBytes > 4 * 1024) {
    throw new Error(
      `Lambda runtime environment is ${environmentBytes} bytes; AWS allows at most 4096 bytes`
    )
  }
  const lambda = lambdaClient()
  const name = functionName(projectId, deploymentId)
  const role = process.env.LAMBDA_EXECUTION_ROLE_ARN
  if (!role) {
    throw new Error("LAMBDA_EXECUTION_ROLE_ARN is required for SSR deployments")
  }

  let existing
  try {
    existing = await lambda.send(new GetFunctionCommand({ FunctionName: name }))
  } catch (err) {
    if (err.name !== "ResourceNotFoundException") throw err
  }

  if (existing) {
    await lambda.send(
      new UpdateFunctionCodeCommand({
        FunctionName: name,
        S3Bucket: s3Bucket,
        S3Key: s3Key,
        Publish: true,
      })
    )
  } else {
    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: name,
        Runtime: "nodejs22.x",
        Role: role,
        Handler: "index.handler",
        Code: { S3Bucket: s3Bucket, S3Key: s3Key },
        Publish: true,
        Timeout: 30,
        MemorySize: 1024,
        Environment: { Variables: environment },
      })
    )
  }

  if (existing) {
    await lambda.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: name,
        Environment: { Variables: environment },
      })
    )
  }

  await waitUntilFunctionActiveV2(
    { client: lambda, maxWaitTime: 120 },
    { FunctionName: name }
  )

  const urlInput = {
    FunctionName: name,
    AuthType: "NONE",
    InvokeMode: "RESPONSE_STREAM",
  }
  let url
  try {
    url = await lambda.send(new CreateFunctionUrlConfigCommand(urlInput))
  } catch (err) {
    if (err.name !== "ResourceConflictException") throw err
    url = await lambda.send(new UpdateFunctionUrlConfigCommand(urlInput))
  }

  return {
    functionArn:
      existing?.Configuration?.FunctionArn ||
      `arn:aws:lambda:${process.env.AWS_REGION || "us-east-1"}:${process.env.AWS_ACCOUNT_ID || "000000000000"}:function:${name}`,
    functionUrl: url.FunctionUrl,
  }
}

async function deleteLambda(name) {
  if (!name) return
  try {
    await lambdaClient().send(new DeleteFunctionCommand({ FunctionName: name }))
  } catch (err) {
    if (err.name !== "ResourceNotFoundException") throw err
  }
}

module.exports = { deployLambda, deleteLambda, functionName }
