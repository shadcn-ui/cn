#!/usr/bin/env node
// cn build — compile project-fitted merge tables from your source files.
//
//   npx cn build                                  scan default globs, write ./cn-tables.mjs
//   npx cn build --content "src/**/*.{ts,tsx}"    scan specific globs (repeatable / comma-separated)
//   npx cn build -o src/lib/cn-tables.ts          output path (.ts or .mjs/.js)
//   npx cn build --safelist safelist.txt          extra class names (file, whitespace-separated)
//   npx cn build --config cn.config.mjs           config extension (default export: { extend, override, prefix } or (config) => config)
//   npx cn build --full                           skip subsetting (all groups; custom config still applies)
//   npx cn build --tokens tokens.txt              use a pre-extracted token file instead of scanning
//
// This file only parses arguments and prints. The work is `build()` from
// "cn/build", which bundler plugins call directly.
import { readFileSync } from "node:fs"
import { gzipSync } from "node:zlib"

const args = process.argv.slice(2)
const HELP = `Usage: cn build [options]

Options:
  --content <glob>     source globs to scan (repeatable or comma-separated;
                       braces like *.{ts,tsx} are supported; a literal
                       directory scans every file in it)
                       default: **/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}
  -o, --out <path>     output module path (default: cn-tables.mjs; .ts emits TS)
  --safelist <file>    extra class names, whitespace-separated
  --config <file>      config extension module (default export)
  --tokens <file>      pre-extracted tokens (skips scanning)
  --full               keep all class groups (no subsetting)
  --cwd <dir>          base directory (default: process.cwd())
  -q, --quiet          suppress summary output
  -h, --help           show this help
  -v, --version        show version
`

const fail = (msg) => {
  console.error("cn: " + msg)
  process.exit(1)
}

if (args.includes("-h") || args.includes("--help") || args.length === 0) {
  console.log(HELP)
  process.exit(0)
}
if (args.includes("-v") || args.includes("--version")) {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  )
  console.log(pkg.version)
  process.exit(0)
}
if (args[0] !== "build") fail(`unknown command "${args[0]}" (expected: build)`)

const opts = {
  content: [],
  out: "cn-tables.mjs",
  safelist: undefined,
  config: undefined,
  tokens: undefined,
  full: false,
  cwd: process.cwd(),
  quiet: false,
}
// Split a --content value on commas that are not inside a {…} brace group,
// so "src/**/*.{ts,tsx}" stays one pattern.
const splitContent = (value) => {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c === "{") depth++
    else if (c === "}") depth = Math.max(0, depth - 1)
    else if (c === "," && depth === 0) {
      out.push(value.slice(start, i))
      start = i + 1
    }
  }
  out.push(value.slice(start))
  return out.map((s) => s.trim()).filter(Boolean)
}

for (let i = 1; i < args.length; i++) {
  const a = args[i]
  const next = () => {
    if (i + 1 >= args.length) fail(`missing value for ${a}`)
    return args[++i]
  }
  if (a === "--content") opts.content.push(...splitContent(next()))
  else if (a === "-o" || a === "--out") opts.out = next()
  else if (a === "--safelist") opts.safelist = next()
  else if (a === "--config") opts.config = next()
  else if (a === "--tokens") opts.tokens = next()
  else if (a === "--full") opts.full = true
  else if (a === "--cwd") opts.cwd = next()
  else if (a === "-q" || a === "--quiet") opts.quiet = true
  else fail(`unknown option "${a}"`)
}

const { build } = await import("../dist/build.js")

let result
try {
  result = await build(opts)
} catch (err) {
  fail(String(err && err.message ? err.message : err))
}

if (!opts.quiet) {
  for (const w of result.warnings) console.error(`cn: ${w}`)
  const gz = gzipSync(result.source, { level: 9 }).length
  const parts = []
  if (!opts.full) {
    parts.push(
      `${result.scannedFiles ? `scanned ${result.scannedFiles} files, ` : ""}${result.tokens.size} candidate tokens`
    )
    parts.push(`${result.usedGroups}/${result.totalGroups} class groups kept`)
  } else {
    parts.push("all class groups kept (--full)")
  }
  console.log(`cn build: ${parts.join(", ")}`)
  console.log(
    `  → ${opts.out} (${(result.source.length / 1024).toFixed(1)} KB source, ${(gz / 1024).toFixed(1)} KB gzip)`
  )
}
