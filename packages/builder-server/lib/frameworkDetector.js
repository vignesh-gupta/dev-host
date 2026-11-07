const fs = require("fs")
const path = require("path")

function findNextConfig(repoDir) {
  for (const filename of [
    "next.config.js",
    "next.config.mjs",
    "next.config.cjs",
    "next.config.ts",
  ]) {
    const configPath = path.join(repoDir, filename)
    if (fs.existsSync(configPath)) return configPath
  }
  return null
}

function readPackageJson(repoDir) {
  const packageJsonPath = path.join(repoDir, "package.json")
  if (!fs.existsSync(packageJsonPath)) return {}
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
}

function hasDependency(packageJson, name) {
  return [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies]
    .some((dependencies) => typeof dependencies?.[name] === "string")
}

function detectFramework(repoDir, configuredFramework) {
  const packageJson = readPackageJson(repoDir)
  if (hasDependency(packageJson, "next") || findNextConfig(repoDir)) return "NEXT"
  if (hasDependency(packageJson, "vite")) return "VITE"
  if (hasDependency(packageJson, "react-scripts")) return "REACT"
  return String(configuredFramework || "STATIC").trim().toUpperCase()
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return null
  }
}

function hasDynamicRoute(route) {
  return typeof route === "string" && /\[[^/]+\]/.test(route)
}

function isStaticNextBuild(repoDir) {
  const nextDir = path.join(repoDir, ".next")
  const exportMarker = readJson(path.join(nextDir, "export-marker.json"))
  if (exportMarker?.isExport === true) return true

  const routesManifest = readJson(path.join(nextDir, "routes-manifest.json"))
  const appRoutes = readJson(path.join(nextDir, "server", "app-path-routes-manifest.json"))
  const prerenderManifest = readJson(path.join(nextDir, "prerender-manifest.json"))
  const middlewareManifest = readJson(path.join(nextDir, "server", "middleware-manifest.json"))

  if (routesManifest?.dynamicRoutes?.length || routesManifest?.rewrites?.length) return false
  if (prerenderManifest?.dynamicRoutes && Object.keys(prerenderManifest.dynamicRoutes).length) {
    return false
  }
  if (Object.keys(appRoutes || {}).some(hasDynamicRoute)) return false
  if (middlewareManifest?.middleware?.length || middlewareManifest?.functions?.length) {
    return false
  }

  return fs.existsSync(path.join(repoDir, "out"))
}

function detectDeploymentType(repoDir, options = {}) {
  const framework = detectFramework(repoDir, options.framework)
  const configuredOutputDir = options.configuredOutputDir || "dist"

  if (framework !== "NEXT") {
    return { framework, deploymentType: "STATIC", outputDir: configuredOutputDir }
  }

  const configPath = findNextConfig(repoDir)
  if (configPath) {
    const source = fs.readFileSync(configPath, "utf8")
    const outputMatch = source.match(/\boutput\s*:\s*["']([^"']+)["']/)
    if (outputMatch?.[1] === "export") {
      return { framework, deploymentType: "STATIC", outputDir: "out" }
    }
  }

  if (isStaticNextBuild(repoDir)) {
    return { framework, deploymentType: "STATIC", outputDir: "out" }
  }

  return { framework, deploymentType: "SSR", outputDir: configuredOutputDir }
}

module.exports = {
  detectDeploymentType,
  detectFramework,
  isStaticNextBuild,
}
