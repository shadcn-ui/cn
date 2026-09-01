// node impl-ab.mjs <script> <implA> <implB> <engine> <rounds> case...
import { execFileSync } from "node:child_process"

const [, , script, a, b, exe, roundsArg, ...cases] = process.argv
const rounds = Number(roundsArg)
const run = (impl, c) =>
  JSON.parse(
    execFileSync(exe, [script, impl, c], {
      encoding: "utf8",
      cwd: import.meta.dirname,
    })
      .trim()
      .split("\n")
      .pop()
  ).nsPerOp
const median = (x) => {
  const s = [...x].sort((p, q) => p - q)
  return s[s.length >> 1]
}
for (const c of cases) {
  const ra = [],
    rb = []
  for (let r = 0; r < rounds; r++) {
    if (r % 2 === 0) {
      ra.push(run(a, c))
      rb.push(run(b, c))
    } else {
      rb.push(run(b, c))
      ra.push(run(a, c))
    }
  }
  const ratios = ra.map((v, i) => rb[i] / v)
  console.log(
    c.padEnd(20),
    a.padEnd(7),
    median(ra).toFixed(1).padStart(8),
    b.padEnd(7),
    median(rb).toFixed(1).padStart(8),
    " b/a median",
    median(ratios).toFixed(2),
    "range",
    Math.min(...ratios).toFixed(2) + "-" + Math.max(...ratios).toFixed(2)
  )
}
