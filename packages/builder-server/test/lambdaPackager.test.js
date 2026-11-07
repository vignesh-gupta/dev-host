const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const {
  getDirectorySize,
  assertLambdaSize,
  createPackageStagingDirectory,
  isPrunableDirectory,
  MAX_UNCOMPRESSED_BYTES,
} = require("../lib/lambdaPackager")

test("prunes runtime-inappropriate directories and keeps application code", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "builder-package-"))
  fs.mkdirSync(path.join(root, "node_modules", "@next", "swc-linux-x64-gnu"), {
    recursive: true,
  })
  fs.mkdirSync(path.join(root, "node_modules", "next"), { recursive: true })
  fs.writeFileSync(
    path.join(root, "node_modules", "@next", "swc-linux-x64-gnu", "binary"),
    "unused"
  )
  fs.writeFileSync(path.join(root, "node_modules", "next", "index.js"), "runtime")
  fs.writeFileSync(path.join(root, "trace.map"), "source map")
  assert.equal(isPrunableDirectory("node_modules/@next/swc-linux-x64-gnu"), true)
  assert.equal(getDirectorySize(root), "runtime".length)
  assert.ok(MAX_UNCOMPRESSED_BYTES > 200 * 1024 * 1024)
})

test("size guard rejects packages above the Lambda expanded limit", () => {
  assert.throws(
    () => assertLambdaSize(MAX_UNCOMPRESSED_BYTES + 1),
    /AWS allows at most/
  )
})

test("stages pnpm symlinks as real runtime files", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "builder-symlink-"))
  const target = path.join(root, "real-package")
  const link = path.join(root, "node_modules", "next")
  fs.mkdirSync(target, { recursive: true })
  fs.mkdirSync(path.dirname(link), { recursive: true })
  fs.writeFileSync(path.join(target, "package.json"), '{"name":"next"}')

  try {
    fs.symlinkSync(target, link, "junction")
  } catch (error) {
    t.skip(`symlinks are unavailable: ${error.message}`)
    return
  }

  const staging = createPackageStagingDirectory(root, "test")
  try {
    assert.equal(
      fs.lstatSync(path.join(staging, "node_modules", "next")).isDirectory(),
      true
    )
    assert.equal(
      fs.readFileSync(
        path.join(staging, "node_modules", "next", "package.json"),
        "utf8"
      ),
      '{"name":"next"}'
    )
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
})
