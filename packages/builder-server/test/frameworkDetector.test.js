const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const { detectDeploymentType, detectFramework } = require("../lib/frameworkDetector")

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "builder-detector-"))
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(root, name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content)
  }
  return root
}

test("detects Next.js before a stale configured framework", () => {
  const root = fixture({
    "package.json": JSON.stringify({ dependencies: { next: "16.4.0" } }),
  })
  assert.equal(detectFramework(root, "REACT"), "NEXT")
})

test("detects an exported Next.js build as static", () => {
  const root = fixture({
    "package.json": JSON.stringify({ dependencies: { next: "16.4.0" } }),
    "next.config.mjs": "export default { output: 'export' }",
  })
  assert.deepEqual(detectDeploymentType(root), {
    framework: "NEXT",
    deploymentType: "STATIC",
    outputDir: "out",
  })
})

test("detects dynamic Next.js routes as server deployments", () => {
  const root = fixture({
    "package.json": JSON.stringify({ dependencies: { next: "16.4.0" } }),
    ".next/routes-manifest.json": JSON.stringify({ dynamicRoutes: [{ page: "/[slug]" }] }),
    ".next/server/app-path-routes-manifest.json": JSON.stringify({
      "/[slug]/page": "app/[slug]/page.js",
    }),
  })
  assert.equal(detectDeploymentType(root).deploymentType, "SSR")
})
