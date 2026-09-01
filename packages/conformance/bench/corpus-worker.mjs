// One (impl × repository corpus) measurement in an isolated process.
// Usage: node bench/corpus-worker.mjs <impl> <corpus.json>
//   → prints JSON {impl, corpus, calls, replaysPerSec, nsPerCall}
import { readFileSync } from "node:fs"
import { basename } from "node:path"

const [, , implName, corpusPath] = process.argv
const groups = JSON.parse(readFileSync(corpusPath, "utf8"))

const WARMUP_MS = 300
const BLOCK_MS = 200
const BLOCKS = 5

const loadImpl = async () => {
  if (implName === "pair") {
    const { clsx } = await import("clsx")
    const { twMerge } = await import("tailwind-merge")
    return (...a) => twMerge(clsx(...a))
  }
  if (implName === "cnfast") return (await import("cnfast")).cn
  if (implName === "cn") return (await import("cn")).cn
  throw new Error("unknown impl " + implName)
}

const fn = await loadImpl()
let sink = 0

const replay = () => {
  let s = 0
  for (let i = 0; i < groups.length; i++) s += fn(...groups[i]).length
  return s
}

// warmup: at least two full replays, or WARMUP_MS of them
const warmStart = performance.now()
sink += replay() + replay()
while (performance.now() - warmStart < WARMUP_MS) sink += replay()

// measure: best of BLOCKS timed blocks, each at least one full replay
let best = 0
for (let block = 0; block < BLOCKS; block++) {
  const t0 = performance.now()
  let passes = 0
  do {
    sink += replay()
    passes++
  } while (performance.now() - t0 < BLOCK_MS)
  const replaysPerSec = passes / ((performance.now() - t0) / 1000)
  if (replaysPerSec > best) best = replaysPerSec
}

console.log(
  JSON.stringify({
    impl: implName,
    corpus: basename(corpusPath, ".json"),
    calls: groups.length,
    replaysPerSec: best,
    nsPerCall: 1e9 / (best * groups.length),
    sink: sink % 10,
  })
)
