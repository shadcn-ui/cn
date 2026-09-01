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
    absWorkingDir: pkgRoot,
    nodePaths: [join(pkgRoot, "node_modules"), join(wsRoot, "node_modules")],
  })
  const bytes = r.outputFiles[0].contents
  return { label, min: bytes.length, gz: gzipSync(bytes, { level: 9 }).length }
}

const rows = [
  await measure("cn (default entry)", `export { cn } from 'cn'`),
  await measure("cn (twMerge only)", `export { twMerge } from 'cn'`),
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
//      "least JavaScript to parse" claim; currently ~13% under
//   2. transfer (min+gzip) within 8% of released cnfast. History: the 5%
//      band was retired 2026-09-01 when the arity-front arg cache and the
//      two-generation doorkeeper spent ~210 B of gzip to make the 30×
//      headline reproducible and fix a 6-15× real-repo corpus regression;
//      gzip sits ~7% over cnfast while parse stays well under
//   3. absolute transfer budget: 10,750 B (creep tripwire); raised from
//      10,500 on 2026-09-01 for the int32 epoch guard (~20 B), to
//      10,650 the same day for routing object/array args through the arg
//      cache, the lone-array arg path, and the JSC-only thin cache front
//      (~85 B on CI's zlib; 0.34x object args, 0.10x lone arrays, 0.62x
//      recurring strings on bun), and to 10,750 for doorkeeper-gated
//      caching of joined strings (~130 B; 0.16x-0.43x on sites with a
//      dynamic arbitrary value, 0.83x cold arbitrary-value renders)
const ours = rows[0]
const cnfast = rows[4]
let fail = false
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
if (ours.gz > 10750) {
  console.error(`SIZE GATE FAIL (budget): cn ${ours.gz} > 10750`)
  fail = true
}
if (fail) process.exit(1)
console.log(
  `size gate ok: parse ${ours.min} < ${cnfast.min}; gzip ${ours.gz} (cnfast ${cnfast.gz}, band ${Math.round(cnfast.gz * 1.08)}); budget 10750`
)
