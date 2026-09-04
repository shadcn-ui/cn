// Bundle-size gate: min+gzip of each entry's full import graph, compared
// against the incumbents. Budget: default cn entry must stay under cnfast.
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"
import { build } from "esbuild"

// resolve through this package so 'cn' and the incumbents load from its own
// install (pnpm does not hoist), regardless of the invoking cwd; keep the
// workspace root as a fallback for hoisting package managers
const pkgRoot = fileURLToPath(new URL("..", import.meta.url))
const wsRoot = fileURLToPath(new URL("../../..", import.meta.url))

const tmp = mkdtempSync(join(tmpdir(), "cn-size-"))
const measure = async (label, entrySource) => {
  const entry = join(tmp, label.replace(/[^a-z0-9]/gi, "_") + ".mjs")
  writeFileSync(entry, entrySource)
  const r = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    target: "es2022",
    metafile: true,
    absWorkingDir: pkgRoot,
    nodePaths: [join(pkgRoot, "node_modules"), join(wsRoot, "node_modules")],
  })
  const bytes = r.outputFiles[0].contents
  return {
    label,
    min: bytes.length,
    gz: gzipSync(bytes, { level: 9 }).length,
    inputs: Object.keys(r.metafile.inputs),
  }
}

const rows = [
  await measure("cn (default entry)", `export { cn } from 'cn'`),
  await measure("cn (twMerge only)", `export { twMerge } from 'cn'`),
  await measure("cn/clsx", `export { default, clsx } from 'cn/clsx'`),
  await measure("tailwind-merge", `export { twMerge } from 'tailwind-merge'`),
  await measure(
    "clsx+tailwind-merge",
    `import { clsx } from 'clsx'; import { twMerge } from 'tailwind-merge'; export const cn = (...a) => twMerge(clsx(a))`
  ),
  await measure("cnfast", `export { cn } from 'cnfast'`),
]
for (const r of rows)
  console.log(
    r.label.padEnd(22),
    String(r.min).padStart(7),
    "min",
    String(r.gz).padStart(7),
    "min+gz"
  )

// Three-part gate encoding the shipped size claims:
//   1. parse cost (raw minified) strictly smaller than cnfast — the README's
//      "least JavaScript to parse" claim. Vs cnfast 0.2.0 (measured
//      2026-09-02) parse is ~35% under; the earlier "~13% under" figure was
//      vs a smaller pre-0.2.0 release
//   2. transfer (min+gzip) within 8% of cnfast. History: the 5% band was
//      retired 2026-09-01 when the arity-front arg cache and the
//      two-generation doorkeeper spent ~210 B of gzip to make the 30×
//      headline reproducible and fix a 6-15× real-repo corpus regression.
//      Vs cnfast 0.2.0 gzip is ~25% under, so this band is currently slack;
//      the absolute budget below is the binding constraint
//   3. absolute transfer budget: 11,100 B (creep tripwire); raised from
//      10,500 on 2026-09-01 for the int32 epoch guard (~20 B), to 10,650
//      the same day for routing object/array args through the arg cache,
//      the lone-array arg path, and the JSC-only thin cache front (~85 B
//      on CI's zlib; 0.34x object args, 0.10x lone arrays, 0.62x recurring
//      strings on bun), to 10,750 for doorkeeper-gated caching of joined
//      strings (~130 B; 0.16x-0.43x on sites with a dynamic arbitrary
//      value, 0.83x cold arbitrary-value renders), and to 10,800 for the
//      JSC-only Map substrate of the whole-string cache (~50 B;
//      0.27x-0.31x on 8k-string working sets on bun), and to 10,950 on
//      2026-09-02 for the claim-table fix (~130 B: Float64 claim keys so
//      group ids cannot alias, a tables-derived claim factor so wide
//      custom conflict groups cannot fill the table, and a per-merge id
//      guard), to 11,000 on 2026-09-02 for Unicode whitespace parity
//      (~77 B: \s-complete separator scan and twJoin array-like values), and
//      to 11,100 for the explicit cache-reset API (~89 B over main on CI's
//      zlib), which releases learned strings and oversized work buffers
const ours = rows[0]
const clsxEntry = rows[2]
const cnfast = rows[5]
let fail = false
if (clsxEntry.inputs.some((path) => /cn[\\/]dist[\\/]tables\.js$/.test(path))) {
  console.error("SIZE GATE FAIL: cn/clsx pulled in the default Tailwind table")
  fail = true
}
if (ours.min >= cnfast.min) {
  console.error(
    `SIZE GATE FAIL (parse): cn ${ours.min} >= cnfast ${cnfast.min}`
  )
  fail = true
}
if (ours.gz > cnfast.gz * 1.08) {
  console.error(
    `SIZE GATE FAIL (gzip band): cn ${ours.gz} > cnfast ${cnfast.gz} * 1.08`
  )
  fail = true
}
if (ours.gz > 11100) {
  console.error(`SIZE GATE FAIL (budget): cn ${ours.gz} > 11100`)
  fail = true
}
if (fail) process.exit(1)
console.log(
  `size gate ok: parse ${ours.min} < ${cnfast.min}; gzip ${ours.gz} (cnfast ${cnfast.gz}, band ${Math.round(cnfast.gz * 1.08)}); budget 11100`
)

// ---------------------------------------------------------------------------
// Size experiments log (metric: min+gzip of the default entry). Kept here so
// nobody re-runs these blind — gzip is already near-optimal on the table
// text, which kills most clever encodings.
//
// Reverted:
// - interned unique-tail pool + per-set id streams: +700 B
// - lexicographic set reordering for gzip locality: +189 B
// - span-scanning numeric validators to kill slices: +144 B, no speed gain
//   (the token memo already absorbs repeat validation)
//
// Kept:
// - unifying the twJoin/clsx join layers into one resolver: −60 B
// - exporting tables as one default object instead of named exports: −90 B
//   of bundler glue
// - second-chance memo + adaptive cache logic: +40 B for the cold-path
//   speed wins (the adaptive off-window was later replaced by doorkeeper
//   admission, which fixed its failure mode — off-windows blocked large
//   recurring working sets from ever warming the cache)
// - sequence-predicting arg cache + doorkeeper-admitted whole-string cache
//   + run-slice emission: +460 B for 30× on the dominant component call and
//   49×/11.7× on the 53-repo corpus replay
// - fused FNV token hash + tagged doorkeeper + direct claim array: −22 B
//   and 1.6×/1.3× on the cold workloads — but a single-generation tagged
//   filter starved recurring working sets bigger than itself (6–15× slower
//   on real-repo replays; caught by speedlab, not the row benches — hence
//   the `workset` workload). Kept only with the two-generation filter below.
// - two-generation doorkeeper + 8192-entry cache + arity fronts for the arg
//   cache: +206 B for a reproducible 30× headline (10.4 ns predicted call),
//   restored corpus replays, and best-yet cold rows
// ---------------------------------------------------------------------------
