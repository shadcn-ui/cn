// The library behind `cn build`: scan sources, subset the config, compile the
// tables, and write the module. The CLI in bin/cn.mjs parses arguments and
// prints; everything else lives here so bundler plugins can call it directly.
//
// Subsetting contract (same as Tailwind's content scanning): every class that
// appears in the scanned sources merges byte-identically to the full tables;
// classes never seen in your sources may instead pass through unmerged. They
// have no CSS in your build anyway. Don't build class names by string
// concatenation, or add them to the safelist if you must.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, resolve, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { compileToSource, mergeConfigs, subsetConfig } from "./compiler"
import { defaultConfig } from "./config"
import type { CnConfig, ConfigExtension } from "./compiler"

const DEFAULT_CONTENT = ["**/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}"]
const DEFAULT_OUT = "cn-tables.mjs"
const MAX_TOKEN_LENGTH = 8192

const realpathOrNull = (path: string) => {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

// ---- mini-glob: pattern → regex; recursive walk, no deps --------------------
const globToRegex = (pattern: string) => {
  let re = ""
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // '**' (+ optional '/') matches any depth including none.
        re += "(?:.*)"
        i++
        if (pattern[i + 1] === "/") {
          re += "/?"
          i++
        }
      } else re += "[^/]*"
    } else if (c === "?") re += "[^/]"
    else if (c === "{") {
      const end = pattern.indexOf("}", i)
      if (end === -1) throw new Error("unclosed { in glob: " + pattern)
      re +=
        "(?:" +
        pattern
          .slice(i + 1, end)
          .split(",")
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("|") +
        ")"
      i = end
    } else if (".+^$()|[]\\".includes(c)) re += "\\" + c
    else re += c
  }
  return new RegExp("^" + re + "$")
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "out",
  "coverage",
  ".svelte-kit",
  ".astro",
  ".vercel",
  ".output",
])

// Literal leading path of a glob: the segments before the first one that
// contains a glob character. "src/**/*.ts" → "src"; "**/*.ts" → "".
const literalPrefix = (pattern: string) => {
  const segs = pattern.split("/")
  const keep = []
  for (const s of segs) {
    if (/[*?{]/.test(s)) break
    keep.push(s)
  }
  return keep.join("/")
}

// Walk `dir` (relative path `rel` from cwd), appending relative file paths.
// `optIn` holds literal prefixes from the patterns; a normally-pruned
// directory is entered when some prefix equals or descends into it.
// Symlinks are followed via statSync; `ancestors` holds the real paths of
// dir's own ancestors in the current recursion branch (added before, and
// removed after, walking a directory's children), so a symlink pointing
// back at one of its ancestors is caught as a cycle without also blocking
// a legitimate second visit to the same real directory from an unrelated
// branch (e.g. a symlink next to the directory it targets).
const walk = (
  dir: string,
  rel: string,
  out: string[],
  optIn: string[],
  ancestors: Set<string>,
  state: { skippedUnreadable: number }
) => {
  let real
  try {
    real = realpathSync(dir)
  } catch {
    state.skippedUnreadable++
    return
  }
  if (ancestors.has(real)) return
  ancestors.add(real)
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    state.skippedUnreadable++
    ancestors.delete(real)
    return
  }
  for (const e of entries) {
    const childRel = rel ? rel + "/" + e.name : e.name
    const childAbs = join(dir, e.name)
    let isDir = e.isDirectory()
    let isFile = e.isFile()
    if (e.isSymbolicLink()) {
      try {
        const st = statSync(childAbs)
        isDir = st.isDirectory()
        isFile = st.isFile()
      } catch {
        continue
      }
    }
    if (isDir) {
      if (e.name === ".git") continue
      const pruned = IGNORED_DIRS.has(e.name) || e.name.startsWith(".")
      if (
        pruned &&
        !optIn.some((p) => p === childRel || p.startsWith(childRel + "/"))
      )
        continue
      walk(childAbs, childRel, out, optIn, ancestors, state)
    } else if (isFile) {
      out.push(childRel)
    }
  }
  ancestors.delete(real)
}

/**
 * Expand content globs to absolute file paths. Patterns support `**`, `?`,
 * and `{a,b}`; a pattern without glob characters is a literal file or
 * directory. Ignored directories such as `node_modules` and dot-directories
 * are entered only when a pattern names them.
 */
export const expandGlobs = (
  patterns: readonly string[],
  cwd: string,
  state = { skippedUnreadable: 0 }
) => {
  const files = new Set<string>()
  let allFiles: string[] | null = null
  const optIn = patterns
    .map((raw) => literalPrefix(raw.replace(/\\/g, "/").replace(/^\.\//, "")))
    .filter(Boolean)
  for (const raw of patterns) {
    const pattern = raw.replace(/\\/g, "/").replace(/^\.\//, "")
    if (!/[*?{]/.test(pattern)) {
      // Literal path: file or directory.
      const p = resolve(cwd, pattern)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isFile()) files.add(p)
      else if (st.isDirectory()) {
        const sub: string[] = []
        walk(p, "", sub, [], new Set(), state)
        for (const f of sub) files.add(join(p, f.split("/").join(sep)))
      }
      continue
    }
    if (allFiles === null) {
      allFiles = []
      walk(cwd, "", allFiles, optIn, new Set(), state)
    }
    const re = globToRegex(pattern)
    for (const f of allFiles)
      if (re.test(f)) files.add(resolve(cwd, f.split("/").join(sep)))
  }
  return [...files]
}

// ---- candidate extraction (over-approximation is safe: unknown tokens only
// classify as "not a Tailwind class"; missing tokens are the danger) ---------
const CANDIDATE_RE = /[^<>"'`\s]*[^<>"'`\s:]/g

/**
 * Add every class-name candidate in `text` to `into`. Returns the number of
 * candidates skipped for exceeding the length cap.
 */
export const extractTokens = (text: string, into: Set<string>) => {
  const matches = text.match(CANDIDATE_RE)
  if (!matches) return 0
  let skippedLong = 0
  for (const m of matches) {
    if (m.length === 0) continue
    if (m.length > MAX_TOKEN_LENGTH) {
      skippedLong++
      continue
    }
    into.add(m)
  }
  return skippedLong
}

const readText = (path: string, what: string, shown: string) => {
  try {
    return readFileSync(path, "utf8")
  } catch (err) {
    throw new Error(`cannot read ${what} ${shown}: ${(err as Error).message}`, {
      cause: err,
    })
  }
}

const addWords = (text: string, into: Set<string>) => {
  for (const t of text.split(/\s+/)) {
    if (t) into.add(t)
  }
}

const loadConfig = async (cwd: string, file: string) => {
  let mod
  try {
    mod = await import(pathToFileURL(resolve(cwd, file)).href)
  } catch (err) {
    throw new Error(`cannot load config ${file}: ${(err as Error).message}`, {
      cause: err,
    })
  }
  const ext = mod.default ?? mod.config
  if (!ext) throw new Error(`config file ${file} has no default export`)
  return ext as ConfigExtension | ((config: CnConfig) => CnConfig)
}

/**
 * Compile project-fitted merge tables and write them to `out`. This is what
 * `cn build` runs. Throws on bad input with the same messages the CLI prints;
 * non-fatal problems come back in `warnings`.
 */
export const build = async (
  options: {
    /** Base directory for every other path. Default: `process.cwd()`. */
    cwd?: string
    /** Source globs to scan. Default: `**\/*.{js,jsx,ts,tsx,html,vue,svelte,astro,mdx}`. */
    content?: readonly string[]
    /** Output module path. A `.ts` extension emits TypeScript. Default: `cn-tables.mjs`. */
    out?: string
    /** File of extra class names, whitespace-separated. */
    safelist?: string
    /** Config extension module: default export `{ extend, override, prefix }` or `(config) => config`. */
    config?: string
    /** File of pre-extracted tokens; skips scanning. */
    tokens?: string
    /** Keep every class group instead of subsetting to the scanned tokens. */
    full?: boolean
  } = {}
) => {
  const cwd = options.cwd ?? process.cwd()
  const out = options.out ?? DEFAULT_OUT
  const outPath = resolve(cwd, out)
  const warnings: string[] = []

  let config = defaultConfig()
  if (options.config) {
    const ext = await loadConfig(cwd, options.config)
    config = typeof ext === "function" ? ext(config) : mergeConfigs(config, ext)
  }

  const tokens = new Set<string>()
  let scannedFiles = 0
  if (!options.full) {
    if (options.tokens) {
      addWords(
        readText(resolve(cwd, options.tokens), "tokens file", options.tokens),
        tokens
      )
    } else {
      const patterns = options.content?.length
        ? options.content
        : DEFAULT_CONTENT
      const state = { skippedUnreadable: 0 }
      let skippedLong = 0
      // A previous output can also appear through a symlink in the content tree.
      const outRealPath = realpathOrNull(outPath)
      const files = expandGlobs(patterns, cwd, state).filter(
        (file) =>
          file !== outPath &&
          (outRealPath === null || realpathOrNull(file) !== outRealPath)
      )
      if (files.length === 0)
        throw new Error(
          "no files matched the content globs; pass --content or use --full"
        )
      for (const f of files) {
        try {
          skippedLong += extractTokens(readFileSync(f, "utf8"), tokens)
          scannedFiles++
        } catch {
          state.skippedUnreadable++
        }
      }
      if (state.skippedUnreadable > 0)
        warnings.push(`skipped ${state.skippedUnreadable} unreadable path(s)`)
      if (skippedLong > 0)
        warnings.push(
          `skipped ${skippedLong} candidate token(s) longer than ${MAX_TOKEN_LENGTH} chars`
        )
    }
    if (options.safelist) {
      addWords(
        readText(resolve(cwd, options.safelist), "safelist", options.safelist),
        tokens
      )
    }
  }

  let usedGroups: number | null = null
  let totalGroups: number | null = null
  if (!options.full) {
    const r = subsetConfig(config, tokens)
    config = r.config
    usedGroups = r.usedGroups
    totalGroups = r.totalGroups
  }

  const lang = outPath.endsWith(".ts") ? "ts" : "js"
  const banner = `// GENERATED by \`cn build\` — do not edit.
// Pair with createCn from "cn/engine":
//   import tables from "./${basename(outPath)}"
//   import { createCn } from "cn/engine"
//   export const cn = createCn(tables)`
  const source = compileToSource(config, { lang, banner })
  try {
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, source)
  } catch (err) {
    throw new Error(`cannot write ${out}: ${(err as Error).message}`, {
      cause: err,
    })
  }

  return {
    /** Absolute path of the written module. */
    outPath,
    /** The emitted module source. */
    source,
    /** Candidate tokens the subset was fitted to. Empty with `full`. */
    tokens,
    /** Files read during the scan. Zero with `tokens` or `full`. */
    scannedFiles,
    /** Class groups kept, or null with `full`. */
    usedGroups,
    /** Class groups in the config, or null with `full`. */
    totalGroups,
    /** Non-fatal problems, in the words the CLI prints. */
    warnings,
  }
}
