const fs = require("fs")
const path = require("path")
const { execFile } = require("child_process")
const { promisify } = require("util")
const { publishLog } = require("./config")

const execFileAsync = promisify(execFile)

function getPathSize(targetPath) {
  const stat = fs.lstatSync(targetPath)
  if (stat.isSymbolicLink()) return 0
  if (stat.isFile()) return stat.size
  if (!stat.isDirectory()) return 0

  let total = 0
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    total += getPathSize(path.join(targetPath, entry.name))
  }
  return total
}

function logOpenNextSizes(outputDir) {
  publishLog("OpenNext output size breakdown:")
  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    const entryPath = path.join(outputDir, entry.name)
    publishLog(
      `  ${entry.name}: ${getPathSize(entryPath)} bytes`
    )
  }

  const serverFunctionsDir = path.join(outputDir, "server-functions")
  if (fs.existsSync(serverFunctionsDir)) {
    for (const entry of fs.readdirSync(serverFunctionsDir, {
      withFileTypes: true,
    })) {
      const entryPath = path.join(serverFunctionsDir, entry.name)
      publishLog(
        `  server function ${entry.name}: ${getPathSize(entryPath)} bytes`
      )
    }
  }

  const defaultNodeModules = path.join(
    serverFunctionsDir,
    "default",
    "node_modules"
  )
  if (fs.existsSync(defaultNodeModules)) {
    const directories = []
    const walk = (directory, depth) => {
      if (depth > 3) return
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const entryPath = path.join(directory, entry.name)
        directories.push({
          path: entryPath,
          bytes: getPathSize(entryPath),
        })
        walk(entryPath, depth + 1)
      }
    }
    walk(defaultNodeModules, 0)
    directories
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 25)
      .reverse()
      .forEach(({ path: directory, bytes }) => {
        publishLog(`  node_modules ${bytes} bytes ${directory}`)
      })
  }

  publishLog(
    `OpenNext server function total: ${getPathSize(
      path.join(outputDir, "server-functions", "default")
    )} bytes`
  )
}

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

function resolveNextVersion(repoDir) {
  const packageJsonPath = path.join(repoDir, "package.json")
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`)
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
  const nextVersion =
    packageJson.dependencies?.next ||
    packageJson.devDependencies?.next ||
    packageJson.peerDependencies?.next

  if (!nextVersion || typeof nextVersion !== "string") {
    throw new Error("Next.js dependency is required for an SSR deployment")
  }

  return nextVersion
}

async function buildWithOpenNext(repoDir) {
  const configPath = path.join(repoDir, "open-next.config.ts")
  if (!fs.existsSync(configPath)) {
    const nextVersion = resolveNextVersion(repoDir)
    fs.writeFileSync(
      configPath,
      `export default {
  default: {
        minify: true,
        override: { wrapper: "aws-lambda" },
        install: {
      packages: [${JSON.stringify(`next@${nextVersion}`)}],
      additionalArgs: "--omit=optional",
    },
  },
}
`
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

  logOpenNextSizes(outputDir)
  return { serverDir, assetsDir }
}

module.exports = { buildWithOpenNext, getPathSize, logOpenNextSizes }
