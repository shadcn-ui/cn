// Regression guard for the epoch int32 wrap fix in engine.ts.
//
// All other suites pass with the fix reverted (the bug needs 2^31 real
// merges to fire), so this test builds patched copies of dist/engine.js
// with `let epoch = 0` rewritten to start at each hazardous boundary:
//
//   A. 2147483640 — merges cross 2^31. With a plain `epoch++` the stored
//      int32 truncates while the JS number keeps growing, claim stamps
//      never match again, and every conflicting class is silently kept.
//   B. -1 — the next merge lands on epoch 0 over cold tables, where
//      unclaimed slots read as claimed: static conflicts drop every class
//      (merge returns ""), and variant-context conflicts spin forever in
//      claimTest's probe loop. Case B therefore runs in a child process
//      under a timeout: the regression is a hang, not just wrong output.
//
// Only the skip-past-zero half is directly testable; the wrap fill also
// prevents stamps from one 2^32 cycle aliasing the same epoch value a full
// cycle later, which no test can reach. Engines are built with cacheSize 0
// so every call is a real merge and bumps the epoch exactly once.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import tables from "cn/tables"
import { twMerge as ref } from "tailwind-merge"

const enginePath = fileURLToPath(
  new URL("../../cn/dist/engine.js", import.meta.url)
)
const INIT = "let epoch = 0;"

const engineAt = (dir, epochInit) => {
  const src = readFileSync(enginePath, "utf8")
  // fail loudly if the patch point is gone — a silently unpatched engine
  // would make every case below pass without testing anything
  if (src.split(INIT).length !== 2) {
    throw new Error(
      `hardening: expected exactly one \`${INIT}\` in dist/engine.js — ` +
        "update this test to match the new engine shape"
    )
  }
  const out = join(dir, `engine-epoch-${epochInit}.mjs`)
  writeFileSync(out, src.replace(INIT, `let epoch = ${epochInit};`))
  return out
}

// distinct multi-token inputs with conflicts in static and variant contexts
const caseAt = (i) =>
  `p-${i} p-${i + 1} text-red-500 text-blue-${(i % 9) + 1}00 flex block ` +
  `hover:m-${i % 12} hover:m-${(i + 1) % 12} mx-${i}`

const runMerges = async (file, count) => {
  const { createEngine } = await import(pathToFileURL(file))
  const engine = createEngine(tables, undefined, { cacheSize: 0 })
  const bad = []
  for (let i = 0; i < count; i++) {
    const input = caseAt(i)
    const got = engine.mergeString(input)
    const want = ref(input)
    if (got !== want) bad.push({ i, got, want })
  }
  return bad
}

// ---- child mode: the epoch-0 merges, run under the parent's timeout -------
if (process.argv[2] === "--wrap-child") {
  const bad = await runMerges(process.argv[3], 10)
  for (const b of bad)
    console.log(
      `  merge ${b.i}: got ${JSON.stringify(b.got)}, want ${JSON.stringify(b.want)}`
    )
  process.exit(bad.length === 0 ? 0 : 1)
}

const dir = mkdtempSync(join(tmpdir(), "cn-hardening-"))
let pass = 0
let fail = 0
const expect = (label, cond, detail = "") => {
  if (cond) pass++
  else {
    fail++
    console.log(`HARDENING FAIL [${label}] ${detail}`)
  }
}

try {
  // A. cross the int32 truncation boundary (merge 8 of 64 lands on 2^31)
  const badA = await runMerges(engineAt(dir, 2147483640), 64)
  expect(
    "int32 truncation",
    badA.length === 0,
    badA.length
      ? `${badA.length}/64 merges disagree with tailwind-merge past 2^31, ` +
          `e.g. merge ${badA[0].i}: got ${JSON.stringify(badA[0].got)}`
      : ""
  )

  // B. land on epoch 0 with cold tables. Must start at exactly -1: earlier
  // merges warm the claimed gids and hide the misread. A regression hangs
  // (variant contexts) or returns "" (static), so run under a timeout.
  const wrapEngine = engineAt(dir, -1)
  let wrapOk = true
  let wrapDetail = ""
  try {
    execFileSync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--wrap-child", wrapEngine],
      { timeout: 30000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    )
  } catch (e) {
    wrapOk = false
    wrapDetail =
      e.signal !== null
        ? `hang: killed by ${e.signal} after 30s (claimTest probe loop never exits at epoch 0)`
        : `wrong output at epoch 0:\n${e.stdout ?? ""}`
  }
  expect("epoch-0 wrap", wrapOk, wrapDetail)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(`hardening: pass ${pass}  fail ${fail}`)
if (fail > 0) process.exit(1)
