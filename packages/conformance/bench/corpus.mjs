// Real-repository replay benchmark: every cn() call harvested from the open
// source codebases in bench/corpora (collected by cnfast's bench suite, see
// corpora/repos.json), replayed through each library. One replay walks a
// repository's calls in order, the way render loops do, so recurring calls
// reward caches and the long tail of one-off strings exercises the merge
// engine. Each (library × repository) runs in its own process (own warmup,
// own heap, best of 5 timed blocks). Before timing, every call is merged by
// all three libraries in this process and output mismatches vs the pair are
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
const libraries = ["pair", "cnfast", "cn"]

const args = process.argv.slice(2)
const jsonOutput = args.includes("--json")
const requested = args.filter((arg) => !arg.startsWith("--"))
const repositories = readdirSync(corporaDir)
  .filter((file) => file.endsWith(".json") && file !== "repos.json")
  .map((file) => file.slice(0, -".json".length))
  .filter((name) => requested.length === 0 || requested.includes(name))
  .sort()
if (repositories.length === 0)
  throw new Error("no corpora matched " + requested)

const pair = (...classValues) => twMerge(clsx(...classValues))

const countMismatches = (groups, merge) => {
  let mismatches = 0
  for (const group of groups)
    if (merge(...group) !== pair(...group)) mismatches++
  return mismatches
}

const measureNsPerCall = (library, corpusPath) => {
  const output = execFileSync(process.execPath, [worker, library, corpusPath], {
    encoding: "utf8",
  })
  return JSON.parse(output.trim().split("\n").pop()).nsPerCall
}

const fmtNs = (ns) =>
  ns >= 1000 ? (ns / 1000).toFixed(2) + " µs" : ns.toFixed(1) + " ns"
const fmtX = (ratio) => ratio.toFixed(2) + "×"
const geomean = (values) =>
  Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length
  )

const formatRow = (row) => {
  const fastest = Math.min(...libraries.map((library) => row[library]))
  const cells = libraries.map(
    (library) =>
      fmtNs(row[library]).padStart(11) + (row[library] === fastest ? "◀" : " ")
  )
  const parityNotes = ["cnfast", "cn"]
    .filter((library) => row.mismatches[library] > 0)
    .map((library) => `${library} differs on ${row.mismatches[library]}`)
  return (
    "  " +
    row.name.padEnd(20) +
    String(row.calls).padStart(7) +
    " calls" +
    cells.join("") +
    fmtX(row.pair / row.cn).padStart(9) +
    " vs pair" +
    fmtX(row.cnfast / row.cn).padStart(8) +
    " vs cnfast" +
    (parityNotes.length ? "   ⚠ " + parityNotes.join(", ") : "")
  )
}

const printSummary = (rows) => {
  const cnWins = rows.filter((row) => row.cn < row.cnfast).length
  const worst = rows.reduce((slowest, row) =>
    row.cnfast / row.cn < slowest.cnfast / slowest.cn ? row : slowest
  )
  const totalCalls = rows.reduce((sum, row) => sum + row.calls, 0)
  console.log(
    `\n${rows.length} repositories, ${totalCalls.toLocaleString("en-US")} calls, ` +
      `ns per call, best of 5 isolated runs\n` +
      `geomean: cn ${fmtX(geomean(rows.map((row) => row.pair / row.cn)))} vs clsx + tailwind-merge, ` +
      `${fmtX(geomean(rows.map((row) => row.cnfast / row.cn)))} vs cnfast ` +
      `(cnfast ${fmtX(geomean(rows.map((row) => row.pair / row.cnfast)))} vs the pair)\n` +
      `cn faster than cnfast on ${cnWins}/${rows.length}; ` +
      `worst: ${worst.name} ${fmtX(worst.cnfast / worst.cn)}`
  )
}

const rows = []
for (const name of repositories) {
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
  for (const library of libraries)
    row[library] = measureNsPerCall(library, corpusPath)
  rows.push(row)
  if (!jsonOutput) console.log(formatRow(row))
}

if (jsonOutput) console.log(JSON.stringify(rows))
else printSummary(rows)
