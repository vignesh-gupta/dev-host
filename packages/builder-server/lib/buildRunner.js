const { exec } = require("child_process")
const path = require("path")
const fs = require("fs")
const { publishLog } = require("./config")

// What the web app sends when the commands were left untouched.
const DEFAULT_INSTALL = "npm install"
const DEFAULT_BUILD = "npm run build"

function detectPackageManager(outDirPath) {
  if (fs.existsSync(path.join(outDirPath, "pnpm-lock.yaml"))) return "pnpm"
  if (fs.existsSync(path.join(outDirPath, "yarn.lock"))) return "yarn"
  if (fs.existsSync(path.join(outDirPath, "package-lock.json"))) return "npm"
  return "npm"
}

/** Custom commands win; the untouched defaults follow the lockfile. */
function resolveCommands(pm, install, build) {
  const detectedInstall = pm === "yarn" ? "yarn install" : `${pm} install`
  const detectedBuild = pm === "yarn" ? "yarn build" : `${pm} run build`
  return {
    installCmd: !install || install === DEFAULT_INSTALL ? detectedInstall : install,
    buildCmd: !build || build === DEFAULT_BUILD ? detectedBuild : build,
  }
}

function parseEnv(json) {
  try {
    return Object.fromEntries(
      JSON.parse(json || "[]").map(({ key, value }) => [key, value])
    )
  } catch (err) {
    throw new Error(
      `BUILD_ENV_JSON must be a JSON array of {key,value} entries: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { cause: err }
    )
  }
}

function buildEnvironment(envJson) {
  const blockedNames = new Set([
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_SECURITY_TOKEN",
    "GIT_PAT_TOKEN",
    "BUILDER_CALLBACK_TOKEN",
    "REDIS_URL",
    "DATABASE_URL",
    "LAMBDA_EXECUTION_ROLE_ARN",
    "LAMBDA_S3_BUCKET",
  ])
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !blockedNames.has(name))
  )
  return { ...inherited, ...parseEnv(envJson), CI: "1" }
}

function runBuild(outDirPath, { installCommand, buildCommand, envJson } = {}) {
  return new Promise((resolve, reject) => {
    const pm = detectPackageManager(outDirPath)
    publishLog(`Detected package manager: ${pm}`)
    const { installCmd, buildCmd } = resolveCommands(pm, installCommand, buildCommand)
    publishLog(`Install: ${installCmd}`)
    publishLog(`Build: ${buildCmd}`)

    const p = exec(`${installCmd} && ${buildCmd}`, {
      cwd: outDirPath,
      env: buildEnvironment(envJson),
      maxBuffer: 64 * 1024 * 1024,
    })

    p.stdout.on("data", (data) => publishLog(data.toString()))
    p.stderr.on("data", (data) => publishLog("Error: " + data.toString()))
    p.on("error", (err) => reject(err))
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Build failed with exit code ${code}`))
      resolve()
    })
  })
}

module.exports = {
  runBuild,
  detectPackageManager,
  resolveCommands,
  parseEnv,
  buildEnvironment,
}
