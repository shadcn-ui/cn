// One (impl × repository corpus) measurement in an isolated process.
// Usage: node bench/corpus-worker.mjs <library> <corpus.json>
//   → prints JSON {library, corpus, calls, replaysPerSec, nsPerCall}
import { readFileSync } from "node:fs"
import { basename } from "node:path"

const [, , library, corpusPath] = process.argv
const groups = JSON.parse(readFileSync(corpusPath, "utf8"))

const WARMUP_MS = 300
const BLOCK_MS = 200
const BLOCKS = 5

const loadLibrary = async () => {
  if (library === "pair") {
    const { clsx } = await import("clsx")
    const { twMerge } = await import("tailwind-merge")
    return (...a) => twMerge(clsx(...a))
  }
  if (library === "cnfast") return (await import("cnfast")).cn
  if (library === "cn") return (await import("cn")).cn
  throw new Error("unknown library " + library)
}

const merge = await loadLibrary()
let sink = 0

const replay = () => {
  let lengthSum = 0
  for (const group of groups) lengthSum += merge(...group).length
  return lengthSum
}

// warmup: at least two full replays, or WARMUP_MS of them
const warmStart = performance.now()
sink += replay() + replay()
while (performance.now() - warmStart < WARMUP_MS) sink += replay()

// measure: best of BLOCKS timed blocks, each at least one full replay
let bestReplaysPerSec = 0
for (let block = 0; block < BLOCKS; block++) {
  const blockStart = performance.now()
  let replays = 0
  do {
    sink += replay()
    replays++
  } while (performance.now() - blockStart < BLOCK_MS)
  const replaysPerSec = replays / ((performance.now() - blockStart) / 1000)
  if (replaysPerSec > bestReplaysPerSec) bestReplaysPerSec = replaysPerSec
}

console.log(
  JSON.stringify({
    library,
    corpus: basename(corpusPath, ".json"),
    calls: groups.length,
    replaysPerSec: bestReplaysPerSec,
    nsPerCall: 1e9 / (bestReplaysPerSec * groups.length),
    sink: sink % 10,
  })
)
