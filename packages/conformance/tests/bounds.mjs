// Regression guard for the claim-set bounds fix in engine.ts.
//
// Three hazards, none reachable by the other suites (they use the default
// tables, short strings, and a fixed variant pool):
//
// A. A custom config whose class group conflicts with 31+ others can fill
//    the (previously fixed-size) claim table, and the probe loop then spins
//    forever. This case runs in a child process under a timeout so a hang
//    is a test failure, not a CI stall.
// B. The claim key used to pack the group id into 13 bits, so group ids
//    above 8191 alias into the context bits and one class is silently
//    dropped. Reachable with the stock default tables given enough distinct
//    arbitrary properties.
// C. The raw-variant-prefix intern map was reset only on the canonical
//    context counter, so different orderings of the same variants leave it
//    growing without bound. This case exercises the reset path rather than
//    observing the bound directly.
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { twMerge } from "cn"
import { twMerge as ref } from "tailwind-merge"

let pass = 0
let fail = 0
const expect = (label, cond, detail = "") => {
  if (cond) pass++
  else {
    fail++
    console.log(`BOUNDS FAIL [${label}] ${detail}`)
  }
}

// ---- child mode: the fan-out merge, run under the parent's timeout --------
if (process.argv[2] === "--wrap-child") {
  const { createTwMerge } = await import("cn/config")
  const { extendTailwindMerge } = await import("tailwind-merge")

  const N = 100
  const classGroups = { big: ["big"] }
  const targets = []
  for (let i = 0; i < N; i++) {
    classGroups["t" + i] = ["t" + i]
    targets.push("t" + i)
  }
  const ext = {
    extend: { classGroups, conflictingClassGroups: { big: targets } },
  }
  const ours = createTwMerge(ext)
  const theirs = extendTailwindMerge(ext)
  const parts = []
  for (let i = 0; i < 64; i++) parts.push(`v${i}:big`)
  const input = parts.join(" ")
  // exit 0 on parity, 1 on mismatch; a hang is caught by the parent's timeout
  process.exit(ours(input) === theirs(input) ? 0 : 1)
}

// ---- A: wide conflict fan-out must not hang the claim table ---------------
{
  let ok = true
  let detail = ""
  try {
    execFileSync(
      process.execPath,
      [fileURLToPath(import.meta.url), "--wrap-child"],
      { timeout: 30000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    )
  } catch (e) {
    ok = false
    detail =
      e.signal !== null
        ? `hang: killed by ${e.signal} after 30s (claim table filled and the probe loop never exits)`
        : `mismatch vs tailwind-merge:\n${e.stdout ?? ""}${e.stderr ?? ""}`
  }
  expect("fan-out-hang", ok, detail)
}

// ---- B: group ids above 8191 must not alias --------------------------------
{
  const toks = []
  for (let i = 0; i < 9000; i++) toks.push(`hover:[p${i}:x]`, `focus:[p${i}:x]`)
  const big = toks.join(" ")
  const got = twMerge(big)
  const want = ref(big)
  const gotCount = got.length ? got.split(" ").length : 0
  const wantCount = want.length ? want.split(" ").length : 0
  expect(
    "gid-overflow",
    got === want,
    got === want
      ? ""
      : `class count ${gotCount} vs tailwind-merge's ${wantCount} (dropped ${wantCount - gotCount})`
  )
}

// ---- C: raw-prefix intern map reset keeps results correct ------------------
{
  const variants = ["hover", "focus", "dark", "md", "lg", "sm", "first", "last"]
  // Heap's algorithm: every permutation of `variants`, in place.
  const perms = []
  const a = variants.slice()
  const c = new Array(a.length).fill(0)
  perms.push(a.slice())
  let i = 0
  while (i < a.length) {
    if (c[i] < i) {
      if (i % 2 === 0) [a[0], a[i]] = [a[i], a[0]]
      else [a[c[i]], a[i]] = [a[i], a[c[i]]]
      perms.push(a.slice())
      c[i]++
      i = 0
    } else {
      c[i] = 0
      i++
    }
  }

  let mismatches = 0
  let firstBad = null
  for (const perm of perms) {
    const prefix = perm.join(":")
    const input = `${prefix}:p-1 ${prefix}:p-2`
    const got = twMerge(input)
    const want = ref(input)
    if (got !== want) {
      mismatches++
      if (!firstBad) firstBad = { input, got, want }
    }
  }

  // re-check a fixed set of earlier inputs after the sweep so the
  // post-reset engine is exercised, not just the last permutation seen
  const recheck = []
  for (let i = 0; i < 20; i++) {
    const perm = perms[i % perms.length]
    const prefix = perm.join(":")
    recheck.push(`${prefix}:p-1 ${prefix}:p-2 text-red-500 hover:m-${i}`)
  }
  for (const input of recheck) {
    const got = twMerge(input)
    const want = ref(input)
    if (got !== want) {
      mismatches++
      if (!firstBad) firstBad = { input, got, want }
    }
  }

  expect(
    "raw-prefix-reset",
    mismatches === 0,
    mismatches
      ? `${mismatches}/${perms.length + recheck.length} inputs disagree, e.g. ${JSON.stringify(firstBad)}`
      : ""
  )
}

console.log(`bounds: pass ${pass}  fail ${fail}`)
if (fail > 0) process.exit(1)
