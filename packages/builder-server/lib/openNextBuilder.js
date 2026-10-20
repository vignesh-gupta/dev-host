const fs = require("fs")
const path = require("path")
const { execFile } = require("child_process")
const { promisify } = require("util")
const { publishLog } = require("./config")

const execFileAsync = promisify(execFile)

function resolveOpenNextCli() {
  const cliPath = path.resolve(
    __dirname,
    "..",
    "node_modules",
    "@opennextjs",
    "aws",
    "dist",
    "index.js"
  )
  if (!fs.existsSync(cliPath)) {
    throw new Error(`OpenNext CLI not found at ${cliPath}`)
  }
  return cliPath
}

async function buildWithOpenNext(repoDir) {
  const configPath = path.join(repoDir, "open-next.config.ts")
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      'export default { default: { override: { wrapper: "aws-lambda-streaming" } } }\n'
    )
  }

  publishLog("Starting OpenNext build")
  await execFileAsync(process.execPath, [resolveOpenNextCli(), "build"], {
    cwd: repoDir,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  })

  const outputDir = path.join(repoDir, ".open-next")
  const serverDir = path.join(outputDir, "server-functions", "default")
  const assetsDir = path.join(outputDir, "assets")
  if (!fs.existsSync(serverDir)) {
    throw new Error(`OpenNext server output not found at ${serverDir}`)
  }
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`OpenNext assets output not found at ${assetsDir}`)
  }

  return { serverDir, assetsDir }
}

module.exports = { buildWithOpenNext }
