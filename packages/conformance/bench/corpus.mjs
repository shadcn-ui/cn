// Real-repository replay benchmark: every cn() call harvested from the open
// source codebases in bench/corpora (collected by cnfast's bench suite, see
// corpora/repos.json), replayed through each library. One replay walks a
// repository's calls in order, the way render loops do, so recurring calls
// reward caches and the long tail of one-off strings exercises the merge
// engine. Each (impl × repository) runs in its own process (own warmup, own
// heap, best of 5 timed blocks). Before timing, every group is merged by all
// three libraries in this process and output mismatches vs the pair are
// counted, so a speed number never hides a parity break.
//
// Run: node bench/corpus.mjs [--json] [repository ...]
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { clsx } from "clsx"
import { cn } from "cn"
import { cn as cnfast } from "cnfast"
import { twMerge } from "tailwind-merge"

const here = fileURLToPath(new URL(".", import.meta.url))
const corporaDir = join(here, "corpora")
const worker = join(here, "corpus-worker.mjs")
const impls = ["pair", "cnfast", "cn"]

const args = process.argv.slice(2)
const jsonOutput = args.includes("--json")
const requested = args.filter((a) => !a.startsWith("--"))
const names = readdirSync(corporaDir)
  .filter((f) => f.endsWith(".json") && f !== "repos.json")
  .map((f) => f.slice(0, -".json".length))
  .filter((name) => requested.length === 0 || requested.includes(name))
  .sort()
if (names.length === 0) throw new Error("no corpora matched " + requested)

const pair = (...a) => twMerge(clsx(...a))
const countMismatches = (groups, fn) => {
  let mismatches = 0
  for (let i = 0; i < groups.length; i++) {
    if (fn(...groups[i]) !== pair(...groups[i])) mismatches++
  }
  return mismatches
}

const runWorker = (impl, corpusPath) =>
  JSON.parse(
    execFileSync(process.execPath, [worker, impl, corpusPath], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .pop()
  )

const fmtNs = (ns) =>
  ns >= 1000 ? (ns / 1000).toFixed(2) + " µs" : ns.toFixed(1) + " ns"
const fmtX = (x) => x.toFixed(2) + "×"
const geomean = (values) =>
  Math.exp(values.reduce((s, v) => s + Math.log(v), 0) / values.length)

const rows = []
for (const name of names) {
  const corpusPath = join(corporaDir, name + ".json")
  const groups = JSON.parse(readFileSync(corpusPath, "utf8"))
  const row = {
    name,
    calls: groups.length,
    mismatches: {
      cnfast: countMismatches(groups, cnfast),
      cn: countMismatches(groups, cn),
    },
  }
  for (const impl of impls) row[impl] = runWorker(impl, corpusPath).nsPerCall
  rows.push(row)
  if (jsonOutput) continue
  const fastest = Math.min(...impls.map((impl) => row[impl]))
  const parityNote = ["cnfast", "cn"]
    .filter((impl) => row.mismatches[impl] > 0)
    .map((impl) => `${impl} differs on ${row.mismatches[impl]}`)
    .join(", ")
  console.log(
    "  " +
      name.padEnd(20) +
      String(row.calls).padStart(7) +
      " calls" +
      impls
        .map(
          (impl) =>
            fmtNs(row[impl]).padStart(11) + (row[impl] === fastest ? "◀" : " ")
        )
        .join("") +
      fmtX(row.pair / row.cn).padStart(9) +
      " vs pair" +
      fmtX(row.cnfast / row.cn).padStart(8) +
      " vs cnfast" +
      (parityNote ? "   ⚠ " + parityNote : "")
  )
}

if (jsonOutput) {
  console.log(JSON.stringify(rows))
} else {
  const cnVsPair = geomean(rows.map((r) => r.pair / r.cn))
  const cnVsCnfast = geomean(rows.map((r) => r.cnfast / r.cn))
  const cnfastVsPair = geomean(rows.map((r) => r.pair / r.cnfast))
  const cnWins = rows.filter((r) => r.cn < r.cnfast).length
  const worst = rows.reduce((a, r) =>
    r.cnfast / r.cn < a.cnfast / a.cn ? r : a
  )
  const totalCalls = rows.reduce((s, r) => s + r.calls, 0)
  console.log(
    `\n${rows.length} repositories, ${totalCalls.toLocaleString("en-US")} calls, ` +
      `ns per call, best of 5 isolated runs\n` +
      `geomean: cn ${fmtX(cnVsPair)} vs clsx + tailwind-merge, ` +
      `${fmtX(cnVsCnfast)} vs cnfast (cnfast ${fmtX(cnfastVsPair)} vs the pair)\n` +
      `cn faster than cnfast on ${cnWins}/${rows.length}; ` +
      `worst: ${worst.name} ${fmtX(worst.cnfast / worst.cn)}`
  )
}
