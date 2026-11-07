const { S3Client } = require("@aws-sdk/client-s3")
const Redis = require("ioredis")

const PROJECT_ID = process.env.PROJECT_ID
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID
const LOG_KEY_ID = DEPLOYMENT_ID || PROJECT_ID || "unknown"
const LOG_CHANNEL = `logs:${LOG_KEY_ID}`
// The web app replays this list for pages opened after the build started.
const LOG_HISTORY = `logs-history:${LOG_KEY_ID}`
const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 7

let publisher
const pendingPublishes = new Set()
if (process.env.REDIS_URL) {
  publisher = new Redis(process.env.REDIS_URL)
}

function publishEvent(event) {
  if (!publisher) return

  const payload = JSON.stringify({
    deploymentId: DEPLOYMENT_ID,
    projectId: PROJECT_ID,
    timestamp: new Date().toISOString(),
    ...event,
  })
  const publish = publisher
    .multi()
    .rpush(LOG_HISTORY, payload)
    .expire(LOG_HISTORY, HISTORY_TTL_SECONDS)
    .publish(LOG_CHANNEL, payload)
    .exec()
    .catch((err) => console.error("Failed to publish log event", err))
    .finally(() => pendingPublishes.delete(publish))
  pendingPublishes.add(publish)
}

function buildEnvValues() {
  try {
    return JSON.parse(process.env.BUILD_ENV_JSON || "[]").map((e) => e.value)
  } catch {
    return []
  }
}

// Never echo secrets (Git token, user env values) into the public build log.
function maskSecrets(text) {
  let out = text
  for (const secret of [process.env.GIT_PAT_TOKEN, ...buildEnvValues()]) {
    if (secret && secret.length >= 4) out = out.split(secret).join("***")
  }
  return out
}

function publishLog(log) {
  const message = maskSecrets(String(log)).trimEnd()
  console.log(message)
  publishEvent({ type: "log", message })
}

function publishStatus(status) {
  publishEvent({ type: "status", status })
}

async function closePublisher() {
  if (!publisher) return
  await Promise.allSettled(pendingPublishes)
  await publisher.quit()
}

const s3Client = new S3Client({
  endpoint: process.env.AWS_ENDPOINT_URL || "http://host.docker.internal:4566",
  region: "us-east-1",
  forcePathStyle: true,
})

async function sendS3Command(command) {
  await s3Client.send(command)
}

module.exports = { sendS3Command, publishLog, publishStatus, closePublisher }
