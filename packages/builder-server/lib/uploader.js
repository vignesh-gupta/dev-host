const path = require("path")
const fs = require("fs")
const { PutObjectCommand } = require("@aws-sdk/client-s3")
const mime = require("mime-types")
const { publishLog, sendS3Command } = require("./config")

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "simple-vercel-output"
const MAX_CONCURRENT_UPLOADS = 4

async function runWithConcurrency(items, worker, limit = MAX_CONCURRENT_UPLOADS) {
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        await worker(items[index])
      }
    }
  )
  await Promise.all(workers)
}

async function uploadDist(
  distFolderPath,
  projectId,
  deploymentId,
  bucket = BUCKET_NAME
) {
  const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true })

  const s3Key = `__outputs/${projectId}/${deploymentId}`

  publishLog("Starting Upload to" + ` s3://${bucket}/${s3Key}...`)

  const files = distFolderContents.filter((file) => {
    const filePath = path.join(distFolderPath, file)
    return !fs.lstatSync(filePath).isDirectory()
  })

  await runWithConcurrency(files, async (file) => {
    const filePath = path.join(distFolderPath, file)
    publishLog(`Uploading ${filePath}...`)

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: `${s3Key}/${file}`,
      Body: fs.createReadStream(filePath),
      ContentType: mime.lookup(filePath) || "application/octet-stream",
    })
    try {
      await sendS3Command(command)
    } catch (err) {
      throw new Error(
        `Failed to upload s3://${bucket}/${s3Key}/${file}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err }
      )
    }
    publishLog(`Uploaded ${filePath}`)
  })

  publishLog("Done...")
  return `s3://${bucket}/__outputs/${projectId}`
}

async function uploadLambdaZip(
  zipFilePath,
  projectId,
  deploymentId,
  bucket = BUCKET_NAME
) {
  const s3Key = `__lambdas/${projectId}/${deploymentId}/lambda.zip`
  publishLog(`Uploading Lambda package to s3://${bucket}/${s3Key}...`)
  try {
    await sendS3Command(
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: fs.createReadStream(zipFilePath),
        ContentType: "application/zip",
      })
    )
  } catch (err) {
    throw new Error(
      `Failed to upload s3://${bucket}/${s3Key}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err }
    )
  }
  publishLog("Lambda package uploaded")
  return s3Key
}

module.exports = { uploadDist, uploadLambdaZip }
