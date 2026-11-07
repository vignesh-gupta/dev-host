const fs = require("fs")
const path = require("path")
const archiver = require("archiver")
const { publishLog } = require("./config")

const MAX_UNCOMPRESSED_BYTES = Number(
  process.env.LAMBDA_MAX_UNCOMPRESSED_BYTES || 250 * 1024 * 1024
)
const IMAGE_FALLBACK_BYTES = Number(
  process.env.LAMBDA_IMAGE_FALLBACK_BYTES || 230 * 1024 * 1024
)
const PRUNE_DIRECTORY_NAMES = new Set([
  "@next/swc",
  "typescript",
  ".next/cache",
  "test",
  "tests",
  "__tests__",
  "docs",
])
const EXCLUDED_FILE_PATTERNS = [".map", ".d.ts", "README", "CHANGELOG"]

function isPrunableDirectory(relativePath) {
  const normalized = relativePath.split(path.sep).join("/")
  if (normalized === ".next/cache" || normalized.endsWith("/.next/cache")) return true
  const name = path.basename(normalized)
  return (
    PRUNE_DIRECTORY_NAMES.has(name) ||
    name.startsWith("swc-") ||
    normalized.includes("/@next/swc-") ||
    (process.env.LAMBDA_KEEP_IMAGE_RUNTIME !== "true" &&
      (normalized.includes("/sharp/") ||
        normalized.includes("/@img/sharp-") ||
        normalized.includes("/@img/sharp-libvips-")))
  )
}

function shouldPackageFile(filePath) {
  const name = path.basename(filePath)
  return !EXCLUDED_FILE_PATTERNS.some(
    (suffix) => name.endsWith(suffix) || name.includes(suffix)
  )
}

function getDirectorySize(directory) {
  let total = 0

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    const relativePath = path.relative(directory, entryPath)
    if (entry.isDirectory() && !isPrunableDirectory(relativePath)) {
      total += getDirectorySize(entryPath)
    } else if (entry.isFile() && shouldPackageFile(entryPath)) {
      total += fs.statSync(entryPath).size
    }
  }

  return total
}

function shouldCopyPath(sourcePath, serverDir) {
  const relativePath = path.relative(serverDir, sourcePath)
  let stat
  try {
    stat = fs.statSync(sourcePath)
  } catch {
    return false
  }

  if (stat.isDirectory()) return !isPrunableDirectory(relativePath)
  return stat.isFile() && shouldPackageFile(sourcePath)
}

function createPackageStagingDirectory(serverDir, deploymentId) {
  const stagingDir = fs.mkdtempSync(
    path.join("/tmp", `lambda-staging-${deploymentId || "deployment"}-`)
  )
  fs.cpSync(serverDir, stagingDir, {
    recursive: true,
    dereference: true,
    filter: (sourcePath) => shouldCopyPath(sourcePath, serverDir),
  })
  return stagingDir
}

function assertLambdaSize(uncompressedBytes) {
  if (uncompressedBytes > IMAGE_FALLBACK_BYTES) {
    publishLog(
      `Lambda package is above the ${IMAGE_FALLBACK_BYTES} byte image-fallback threshold`
    )
  }
  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new Error(
      `Lambda package is ${uncompressedBytes} bytes uncompressed after configured pruning; AWS allows at most ${MAX_UNCOMPRESSED_BYTES} bytes. Use a Lambda container image for this deployment.`
    )
  }
}

function packageLambda(serverDir, deploymentId) {
  const stagingDir = createPackageStagingDirectory(serverDir, deploymentId)
  const uncompressedBytes = getDirectorySize(stagingDir)
  publishLog(
    `Lambda package uncompressed size: ${uncompressedBytes} bytes (limit ${MAX_UNCOMPRESSED_BYTES} bytes)`
  )
  try {
    assertLambdaSize(uncompressedBytes)
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true })
    throw error
  }

  const zipFilePath = path.join("/tmp", `lambda-${deploymentId || "deployment"}.zip`)
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath)
    const archive = archiver("zip", { zlib: { level: 9 } })
    const cleanup = () => fs.rmSync(stagingDir, { recursive: true, force: true })

    output.on("close", () => {
      publishLog(`Created Lambda package (${archive.pointer()} bytes)`)
      cleanup()
      resolve(zipFilePath)
    })
    output.on("error", (error) => {
      cleanup()
      reject(error)
    })
    archive.on("error", (error) => {
      cleanup()
      reject(error)
    })
    archive.pipe(output)
    archive.directory(stagingDir, false)
    archive.finalize().catch(reject)
  })
}

module.exports = {
  packageLambda,
  getDirectorySize,
  createPackageStagingDirectory,
  assertLambdaSize,
  isPrunableDirectory,
  MAX_UNCOMPRESSED_BYTES,
  IMAGE_FALLBACK_BYTES,
}
