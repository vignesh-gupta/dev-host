const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")
const { getPathSize } = require("../lib/openNextBuilder")

test("measures OpenNext files and directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "builder-open-next-"))
  fs.writeFileSync(path.join(root, "open-next.output.json"), "{}")
  fs.mkdirSync(path.join(root, "assets"))
  fs.writeFileSync(path.join(root, "assets", "index.html"), "static")

  assert.equal(getPathSize(path.join(root, "open-next.output.json")), 2)
  assert.equal(getPathSize(root), 8)
})
