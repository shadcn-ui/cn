// speedlab — regenerates the shareable benchmark page from live measurements.
//
//   pnpm speedlab                 measure everything, emit speedlab/dist/speedlab.html
//   pnpm speedlab -- --skip-corpora   skip the per-repository corpus sweep
//   pnpm speedlab -- --corpora <dir>   sweep a different corpora directory
//   pnpm speedlab -- --skip-bench      reuse nothing, but skip the slow matrix (layout work)
//
// Everything on the page is produced by this script at run time: the
// reference matrix (isolated worker processes, best of 5), the optional
// per-repository corpus sweep, the bundle sizes, and the inlined library
// bundle that powers the page's run-in-your-browser mode.
import { execFileSync, execSync } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"
import { build } from "esbuild"

const here = fileURLToPath(new URL(".", import.meta.url))
const conformance = resolve(here, "..")
const repoRoot = resolve(conformance, "../..")

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? (args[i + 1] ?? true) : undefined
}
const corporaDir = args.includes("--skip-corpora")
  ? undefined
  : (flag("--corpora") ?? join(conformance, "bench/corpora"))
const skipBench = args.includes("--skip-bench")

const fmtNs = (ns) =>
  ns >= 1e6
    ? (ns / 1e6).toFixed(1) + " ms"
    : ns >= 1000
      ? (ns / 1000).toFixed(1) + " µs"
      : Math.round(ns) + " ns"
const fmtX = (x) => (x >= 10 ? Math.round(x) + "×" : x.toFixed(1) + "×")

// ---- 1. reference matrix (isolated workers) ---------------------------------
const runWorker = (script, ...a) => {
  const out = execFileSync(
    process.execPath,
    [join(conformance, "bench", script), ...a],
    {
      encoding: "utf8",
      cwd: conformance,
    }
  )
  return JSON.parse(out.trim().split("\n").pop())
}

const referenceRows = []
if (!skipBench) {
  const impls = ["pair", "cnfast", "cn"]
  const component = {}
  for (const impl of impls) {
    process.stderr.write(`component ${impl} … `)
    component[impl] = runWorker("component-worker.mjs", impl, "single").nsPerOp
  }
  process.stderr.write("\n")
  const rows = [
    {
      key: "component",
      label: "the call your components make most",
      small: "cn(base, variant, condition &amp;&amp; extra)",
      data: component,
    },
    { key: "repeat", label: "same classes as last render", small: "cache hit" },
    { key: "short", label: "typical component strings, warm" },
    { key: "arb", label: "cold render, many arbitrary values" },
    { key: "ssr", label: "cold render, SSR-style unique strings" },
  ]
  for (const row of rows) {
    if (row.data) continue
    row.data = {}
    for (const impl of ["pair", "cnfast", "cn"]) {
      process.stderr.write(`${row.key} ${impl} … `)
      row.data[impl] = runWorker("worker.mjs", impl, row.key).nsPerOp
    }
    process.stderr.write("\n")
  }
  // init row: first call in a fresh process
  // init = lazy setup + first merge, measured AFTER module import so we
  // time the library's own work (trie build vs table decode), not disk I/O
  const initOf = (imports, call) =>
    Number(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `${imports}; const t0 = performance.now(); ${call}; console.log(performance.now() - t0)`,
        ],
        { encoding: "utf8", cwd: conformance }
      ).trim()
    ) * 1e6
  process.stderr.write("init … ")
  const init = {
    pair: initOf(
      `const { clsx } = await import('clsx'); const { twMerge } = await import('tailwind-merge')`,
      `twMerge(clsx('p-1 p-2'))`
    ),
    cnfast: initOf(`const { cn } = await import('cnfast')`, `cn('p-1 p-2')`),
    cn: initOf(`const { cn } = await import('cn')`, `cn('p-1 p-2')`),
  }
  process.stderr.write("\n")
  rows.push({
    key: "init",
    label: "very first call",
    small: "page load",
    data: init,
  })

  for (const row of rows) {
    const d = row.data
    const min = Math.min(d.pair, d.cnfast, d.cn)
    const cell = (v) =>
      v <= min * 1.07
        ? `<td class="win">${fmtNs(v)}</td>`
        : `<td>${fmtNs(v)}</td>`
    referenceRows.push(
      `        <tr><td>${row.label}${row.small ? `<small>${row.small}</small>` : ""}</td>` +
        `${cell(d.pair)}${cell(d.cnfast)}${cell(d.cn)}` +
        `<td class="mult win">${fmtX(d.pair / d.cn)}</td></tr>`
    )
  }
}

// ---- 2. corpus sweep (optional) ----------------------------------------------
let repoSection = ""
if (corporaDir && !skipBench) {
  const files = readdirSync(corporaDir)
    .filter((f) => f.endsWith(".json") && f !== "repos.json")
    .sort()
  const rows = []
  for (const f of files) {
    const row = { name: f.replace(".json", "") }
    for (const impl of ["pair", "cnfast", "cn"]) {
      const r = runWorker("corpus-worker.mjs", impl, join(corporaDir, f))
      row[impl] = r.replaysPerSec
      row.calls = r.calls
    }
    rows.push(row)
    process.stderr.write(".")
  }
  process.stderr.write("\n")
  rows.sort((a, b) => b.calls - a.calls)
  const gm = (k) =>
    Math.exp(rows.reduce((s, r) => s + Math.log(r.cn / r[k]), 0) / rows.length)
  const fmtOps = (v) =>
    v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)
  const body = rows
    .map(
      (r) =>
        `<tr><td>${r.name}<small>${r.calls.toLocaleString("en-US")} calls</small></td>` +
        `<td>${fmtOps(r.pair)}</td><td>${fmtOps(r.cnfast)}</td>` +
        `<td class="win">${fmtOps(r.cn)}</td>` +
        `<td class="mult win">${fmtX(r.cn / r.pair)}</td>` +
        `<td class="mult win">${fmtX(r.cn / r.cnfast)}</td></tr>`
    )
    .join("\n")
  repoSection = `  <h2>Real repositories <span class="n">node · one process per library and repo · best of 5</span></h2>
  <p class="sub">Every <code>cn()</code> call harvested from ${rows.length} open source
  codebases (corpus collection by cnfast's bench suite), replayed through each
  library. One op is a full replay of a repository's calls; replays repeat the
  same call sequence, the way render loops do, which rewards caches. Geometric
  mean across all ${rows.length} repos: cn is <b>${fmtX(gm("pair"))}</b> the pair and
  <b>${fmtX(gm("cnfast"))}</b> cnfast.</p>
  <div class="tblwrap">
    <table>
      <thead><tr><th>repository</th><th>clsx + twm</th><th>cnfast</th><th>cn</th><th>vs pair</th><th>vs cnfast</th></tr></thead>
      <tbody>
${body}
      </tbody>
    </table>
  </div>`
} else if (!skipBench) {
  repoSection = `  <!-- corpus sweep skipped (--skip-corpora) -->`
}

// ---- 3. bundle sizes -----------------------------------------------------------
const measureSize = async (contents) => {
  const r = await build({
    stdin: { contents, resolveDir: conformance },
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    target: "es2022",
  })
  const b = r.outputFiles[0].contents
  return { min: b.length, gz: gzipSync(b, { level: 9 }).length }
}
const kb = (n) => (n / 1024).toFixed(1) + " KB"
const sizes = {
  pair: await measureSize(
    `import { clsx } from 'clsx'; import { twMerge } from 'tailwind-merge'; export const cn = (...a) => twMerge(clsx(a))`
  ),
  cnfast: await measureSize(`export { cn } from 'cnfast'`),
  cn: await measureSize(`export { cn } from 'cn'`),
}
const minGz = Math.min(sizes.pair.gz, sizes.cnfast.gz, sizes.cn.gz)
const minMin = Math.min(sizes.pair.min, sizes.cnfast.min, sizes.cn.min)
const sCell = (v, best) =>
  v <= best
    ? `<td class="win">${kb(v)}</td>`
    : v === sizes.cn.gz || v === sizes.cn.min
      ? `<td class="lose">${kb(v)}</td>`
      : `<td>${kb(v)}</td>`
const sizeRows = [
  `        <tr><td>clsx + tailwind-merge</td>${sCell(sizes.pair.gz, minGz)}${sCell(sizes.pair.min, minMin)}</tr>`,
  `        <tr><td>cnfast</td>${sCell(sizes.cnfast.gz, minGz)}${sCell(sizes.cnfast.min, minMin)}</tr>`,
  `        <tr><td>cn, default</td>${sCell(sizes.cn.gz, minGz)}${sCell(sizes.cn.min, minMin)}</tr>`,
].join("\n")

// ---- 4. library bundle for the in-browser mode ---------------------------------
const libs = await build({
  stdin: {
    contents: `import { cn } from 'cn'
import { cn as cnfastCn } from 'cnfast'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
window.__LIBS = { cn, cnfast: cnfastCn, pair: (...a) => twMerge(clsx(...a)) }`,
    resolveDir: conformance,
  },
  bundle: true,
  minify: true,
  format: "iife",
  write: false,
  target: "es2022",
})
const libsJs = new TextDecoder()
  .decode(libs.outputFiles[0].contents)
  .replace(/<\/script/g, "<\\/script")

// ---- 5. assemble ------------------------------------------------------------------
let html = readFileSync(join(here, "template.html"), "utf8")
const rev = (() => {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim()
  } catch {
    return "unknown"
  }
})()
const meta = `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · Node ${process.version} · ${rev} · <code>pnpm speedlab</code>`
const pkgVersion = (p) => JSON.parse(readFileSync(p, "utf8")).version
const versions = [
  "cn " + pkgVersion(join(repoRoot, "packages/cn/package.json")),
  "cnfast " + pkgVersion(join(conformance, "node_modules/cnfast/package.json")),
  "tailwind-merge " +
    pkgVersion(join(conformance, "node_modules/tailwind-merge/package.json")),
  "clsx " + pkgVersion(join(conformance, "node_modules/clsx/package.json")),
].join(" · ")
html = html.replace("<!--VERSIONS-->", versions)
html = html.replace("<!--META-->", meta)
html = html.replace(
  "<!--REFERENCE_ROWS-->",
  referenceRows.join("\n") ||
    "        <tr><td>skipped (--skip-bench)</td><td></td><td></td><td></td><td></td></tr>"
)
html = html.replace("<!--REPO_SECTION-->", repoSection)
html = html.replace("<!--SIZE_ROWS-->", sizeRows)
html = html.replace("/*__LIBS__*/", libsJs)

mkdirSync(join(here, "dist"), { recursive: true })
const out = join(here, "dist", "speedlab.html")
writeFileSync(out, html)
console.log(`speedlab → ${out} (${(html.length / 1024).toFixed(0)} KB)`)
