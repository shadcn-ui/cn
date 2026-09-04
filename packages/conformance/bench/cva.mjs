import { execFileSync } from "node:child_process"
import { cpus } from "node:os"
import { fileURLToPath } from "node:url"

const worker = fileURLToPath(new URL("./cva-worker.mjs", import.meta.url))
const scenarios = [
  ["creation", "creation"],
  ["realistic-fixed", "realistic mix, fixed"],
  ["realistic-shuffled", "realistic mix, shuffled"],
  ["defaults", "all defaults / zero argument"],
  ["shadcn-steady", "shadcn steady state"],
  ["memo-churn-fixed", "memo miss churn, fixed"],
  ["memo-churn-shuffled", "memo miss churn, shuffled"],
  ["compound-heavy", "compound heavy"],
  ["object-class", "mutable object className"],
  ["composite", "composite cn(cva(props))"],
]
const implementations = ["reference", "cnfast", "cn"]
const format = (ns) =>
  ns >= 1000 ? `${(ns / 1000).toFixed(2)} us` : `${ns.toFixed(1)} ns`

console.log(
  "CVA replay against class-variance-authority 0.7.1 and cnfast 0.2.0"
)
console.log(
  `${process.version} on ${process.platform}/${process.arch}; ${cpus()[0]?.model}`
)
console.log("48 generated sites, 1,152 realistic calls; best of 15 samples")
const callRatios = []
for (const [key, label] of scenarios) {
  const rows = []
  for (const implementation of implementations) {
    const output = execFileSync(
      process.execPath,
      [worker, implementation, key],
      {
        encoding: "utf8",
      }
    )
    rows.push(JSON.parse(output.trim().split("\n").pop()))
  }
  const byName = Object.fromEntries(rows.map((row) => [row.impl, row.nsPerOp]))
  const speedup = byName.reference / byName.cn
  const versusCnfast = byName.cnfast / byName.cn
  if (key !== "creation") callRatios.push([speedup, versusCnfast])
  console.log(
    `${label.padEnd(32)} cn ${format(byName.cn).padStart(9)} | ` +
      `cva ${format(byName.reference).padStart(9)} | ` +
      `cnfast ${format(byName.cnfast).padStart(9)} | ` +
      `${speedup.toFixed(2)}x vs cva | ${versusCnfast.toFixed(2)}x vs cnfast`
  )
}

const geometricMean = (values) =>
  Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length
  )
console.log(
  `nine call-scenario geometric mean (synthetic): ` +
    `${geometricMean(callRatios.map(([speedup]) => speedup)).toFixed(2)}x vs cva | ` +
    `${geometricMean(callRatios.map(([, versusCnfast]) => versusCnfast)).toFixed(2)}x vs cnfast`
)
