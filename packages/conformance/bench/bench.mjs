// Benchmark orchestrator: runs each (impl × workload) in an isolated child
// process (own warmup, own heap, best-of-5) and prints a table.
// Run: node bench/bench.mjs
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const worker = fileURLToPath(new URL("./worker.mjs", import.meta.url))
const impls = ["tailwind-merge", "cnfast", "cn", "cn-nocache"]
const workloads = [
  ["short", "short typical strings (16 recurring, warm caches)"],
  ["long", "long variant-heavy strings (64 recurring, ~30 tokens)"],
  ["arb", "arbitrary-heavy, 50k unique strings (fully cold)"],
  ["repeat", "repeated identical call (best-case cache hit)"],
  ["ssr", "50k unique strings, recurring vocabulary (SSR-like)"],
  ["workset", "8k distinct recurring strings (real-repo working set)"],
]

const fmt = (ns) =>
  ns >= 1000 ? (ns / 1000).toFixed(2) + " µs" : ns.toFixed(1) + " ns"

for (const [key, label] of workloads) {
  console.log(`\n• ${label}`)
  const rows = []
  for (const impl of impls) {
    const out = execFileSync(process.execPath, [worker, impl, key], {
      encoding: "utf8",
    })
    rows.push(JSON.parse(out.trim().split("\n").pop()))
  }
  const bestCached = Math.min(
    ...rows.filter((r) => r.impl !== "cn-nocache").map((r) => r.nsPerOp)
  )
  for (const r of rows) {
    const mark = r.nsPerOp === bestCached ? "  ◀ fastest" : ""
    console.log("  " + r.impl.padEnd(16) + fmt(r.nsPerOp).padStart(10) + mark)
  }
}

// ---- the README headline row: cn(base, variant, cond && extra) ---------------
const componentWorker = fileURLToPath(
  new URL("./component-worker.mjs", import.meta.url)
)
const componentModes = [
  ["single", "component call: one stable call site"],
  ["loop", "component call: render loop, 24 unique sites"],
  ["dup-loop", "component call: render loop, duplicate arg tuples"],
  ["interp", "component call: interpolated arg, fresh string per call"],
]
for (const [mode, label] of componentModes) {
  console.log(`\n• ${label}`)
  const rows = []
  for (const impl of ["pair", "cnfast", "cn"]) {
    const out = execFileSync(process.execPath, [componentWorker, impl, mode], {
      encoding: "utf8",
    })
    rows.push(JSON.parse(out.trim().split("\n").pop()))
  }
  const best = Math.min(...rows.map((r) => r.nsPerOp))
  for (const r of rows) {
    const mark = r.nsPerOp === best ? "  ◀ fastest" : ""
    console.log("  " + r.impl.padEnd(16) + fmt(r.nsPerOp).padStart(10) + mark)
  }
}
