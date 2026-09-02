// Differential suite for the join layer (clsx / twJoin / clsx-lite value
// shapes), run against the BUILT package (dist/). Run: node tests/join.mjs
import { clsx as refClsx } from "clsx"
import { clsx as refLite } from "clsx/lite"
import { clsx, twJoin } from "cn"
import clsxEntryDefault, { clsx as clsxEntry } from "cn/clsx"
import { clsx as liteClsx } from "cn/lite"
import { twJoin as refTwJoin } from "tailwind-merge"

const ITERS = Number(process.env.JOIN_ITERS ?? 20000)

let seed = 0x5eed1234
const rnd = () => {
  seed ^= seed << 13
  seed >>>= 0
  seed ^= seed >> 17
  seed ^= seed << 5
  seed >>>= 0
  return seed / 0x100000000
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

let pass = 0
let fail = 0
const report = []
const bigintReplacer = (k, v) =>
  typeof v === "bigint" ? v.toString() + "n" : v
const diff = (label, args, expected, actual) => {
  if (expected === actual) pass++
  else {
    fail++
    if (report.length < 30) report.push({ label, args, expected, actual })
  }
}
const hand = (label, actual, expected) => diff(label, "-", expected, actual)

// value generator, recursive with depth <= 3.
const mkValue = (depth) => {
  const r = rnd()
  if (r < 0.35)
    return pick(["p-2", "px-4", "text-sm", "hover:p-1", "", "a b", " "])
  if (r < 0.45) return pick([null, undefined, false, 0, 0n, NaN, ""])
  if (r < 0.55) return pick([1, 2, 42, -1, 3n, true])
  if (r < 0.75 && depth < 3) {
    const arr = []
    const n = Math.floor(rnd() * 4)
    for (let i = 0; i < n; i++) arr.push(mkValue(depth + 1))
    return arr
  }
  if (r < 0.9) {
    const o = {}
    const n = Math.floor(rnd() * 4)
    for (let i = 0; i < n; i++)
      o[pick(["p-2", "flex", "block", "x", ""])] = pick([
        true,
        false,
        1,
        0,
        "y",
        null,
      ])
    return o
  }
  // array-like object (not an array).
  return { length: 2, 0: pick(["p-4", ""]), 1: pick(["m-2", null]) }
}

const mkStringlyValue = () =>
  pick(["p-2", "px-4", "text-sm", "", null, undefined, false, 0, NaN])

// ---------- 1. clsx (cn) vs clsx (reference) --------------------------------
for (let i = 0; i < ITERS; i++) {
  const args = []
  const n = Math.floor(rnd() * 6)
  for (let k = 0; k < n; k++) args.push(mkValue(0))
  diff(
    "clsx",
    JSON.stringify(args, bigintReplacer),
    refClsx(...args),
    clsx(...args)
  )
  diff(
    "clsx entry named",
    JSON.stringify(args, bigintReplacer),
    refClsx(...args),
    clsxEntry(...args)
  )
  diff(
    "clsx entry default",
    JSON.stringify(args, bigintReplacer),
    refClsx(...args),
    clsxEntryDefault(...args)
  )
}

// ---------- 2. twJoin (cn) vs twJoin (reference) ----------------------------
for (let i = 0; i < ITERS; i++) {
  const args = []
  const n = Math.floor(rnd() * 6)
  for (let k = 0; k < n; k++) args.push(mkValue(0))
  diff(
    "twJoin",
    JSON.stringify(args, bigintReplacer),
    refTwJoin(...args),
    twJoin(...args)
  )
}

// ---------- 3. clsx/lite (cn) vs clsx/lite (reference) ----------------------
// clsx/lite ignores everything but strings and falsy values by contract.
for (let i = 0; i < ITERS; i++) {
  const args = []
  const n = Math.floor(rnd() * 6)
  for (let k = 0; k < n; k++) args.push(mkStringlyValue())
  diff(
    "clsx-lite",
    JSON.stringify(args, bigintReplacer),
    refLite(...args),
    liteClsx(...args)
  )
}

// ---------- 4. hand cases -----------------------------------------------------
hand(
  "twJoin array-like",
  twJoin({ length: 2, 0: "p-4", 1: "m-2" }),
  refTwJoin({ length: 2, 0: "p-4", 1: "m-2" })
)
hand(
  "twJoin nested array-like",
  twJoin(["a", { length: 1, 0: "b" }]),
  refTwJoin(["a", { length: 1, 0: "b" }])
)
hand(
  "clsx array-like is a dict",
  clsx({ length: 2, 0: "p-4", 1: "m-2" }),
  refClsx({ length: 2, 0: "p-4", 1: "m-2" })
)
hand(
  "clsx function",
  clsx(() => {}),
  refClsx(() => {})
)
hand(
  "twJoin function",
  twJoin(() => {}),
  refTwJoin(() => {})
)

console.log(`join: pass ${pass}  fail ${fail}`)
for (const r of report) {
  console.log(`DIFF [${r.label}] args=${r.args}`)
  console.log(`     ref = ${JSON.stringify(r.expected)}`)
  console.log(`     cn  = ${JSON.stringify(r.actual)}`)
}
process.exit(fail > 0 ? 1 : 0)
