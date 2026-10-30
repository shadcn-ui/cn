// Reads the theme scales Tailwind v4 stylesheets declare, so `cn build`
// can register them without a hand-written config. Only `@theme` blocks
// are read: `--radius-card` adds `card` to the radius scale, and
// `--radius-*: initial` replaces the default scale with the names declared
// after it, the way Tailwind does. `@import`s are followed the way
// Tailwind resolves them: relative paths and packages, not bundler aliases.
import { readFileSync, realpathSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { ClassGroupDef, ConfigExtension } from "./compiler"

// Tailwind namespace → cn theme scale. Longest first, so `--text-shadow-x`
// is a text shadow and `--font-weight-x` a weight. `--color-*` and
// `--font-*` are left out: cn already accepts any name on those scales.
const NAMESPACES: [string, string][] = [
  ["inset-shadow", "inset-shadow"],
  ["drop-shadow", "drop-shadow"],
  ["text-shadow", "text-shadow"],
  ["font-weight", "font-weight"],
  ["perspective", "perspective"],
  ["breakpoint", "breakpoint"],
  ["container", "container"],
  ["tracking", "tracking"],
  ["spacing", "spacing"],
  ["leading", "leading"],
  ["animate", "animate"],
  ["radius", "radius"],
  ["shadow", "shadow"],
  ["aspect", "aspect"],
  ["blur", "blur"],
  ["ease", "ease"],
  ["text", "text"],
]

// Strings match first, so the `/*` in `@source "../dist/*.js"` opens no
// comment.
const stripComments = (css: string) =>
  css.replace(
    /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*')|\/\*[\s\S]*?(?:\*\/|$)/g,
    (_, string?: string) => string ?? ""
  )

// The declarations directly inside `@theme` blocks, in source order. A
// nested block such as `@keyframes` is skipped, not split on.
const themeDeclarations = (css: string) => {
  const declarations: [string, string][] = []
  const theme: boolean[] = []
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const char = css[i]
    if (char === '"' || char === "'") {
      for (i++; i < css.length && css[i] !== char; i++) {
        if (css[i] === "\\") {
          i++
        }
      }
    } else if (char === "{") {
      theme.push(/^@theme\b/.test(css.slice(start, i).trim()))
      start = i + 1
    } else if (char === ";" || char === "}") {
      if (theme.at(-1)) {
        const decl = css.slice(start, i)
        const colon = decl.indexOf(":")
        if (colon !== -1) {
          declarations.push([
            decl.slice(0, colon).trim(),
            decl.slice(colon + 1).trim(),
          ])
        }
      }
      if (char === "}") {
        theme.pop()
      }
      start = i + 1
    }
  }
  return declarations
}

/** Whether a stylesheet is a Tailwind entry or declares theme values. */
export const isTailwindCss = (css: string) =>
  /@theme\b/.test(css) || /@import\s+(?:url\(\s*)?["']tailwindcss/.test(css)

const isFile = (path: string) => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

type PackageJson = { exports?: unknown; style?: string }

const readPackage = (dir: string) => {
  try {
    return JSON.parse(
      readFileSync(join(dir, "package.json"), "utf8")
    ) as PackageJson
  } catch {
    return null
  }
}

const conditionTarget = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(conditionTarget).find(Boolean) ?? null
  }
  if (value && typeof value === "object") {
    for (const [condition, target] of Object.entries(value)) {
      if (condition === "style" || condition === "default") {
        const found = conditionTarget(target)
        if (found) {
          return found
        }
      }
    }
  }
  return null
}

// A package's `exports` target for a subpath under the `style` or `default`
// condition, with patterns matched by longest prefix, as Node does.
const exportTarget = (exports: unknown, subpath: string) => {
  if (
    !exports ||
    typeof exports !== "object" ||
    Array.isArray(exports) ||
    !Object.keys(exports).some((key) => key.startsWith("."))
  ) {
    return subpath === "." ? conditionTarget(exports) : null
  }
  const map = exports as Record<string, unknown>
  if (subpath in map) {
    return conditionTarget(map[subpath])
  }
  const key = Object.keys(map)
    .filter((key) => {
      const [prefix, suffix] = key.split("*")
      return (
        suffix !== undefined &&
        subpath.startsWith(prefix) &&
        subpath.endsWith(suffix) &&
        subpath.length >= key.length
      )
    })
    .sort((a, b) => b.indexOf("*") - a.indexOf("*"))[0]
  if (!key) {
    return null
  }
  const [prefix, suffix] = key.split("*")
  const match = subpath.slice(prefix.length, subpath.length - suffix.length)
  return conditionTarget(map[key])?.replaceAll("*", match) ?? null
}

// Resolves an `@import` the way Tailwind's resolver does: a relative path,
// or a package through its `exports`, its `style` field, or `index.css`.
// Tailwind itself is skipped because cn's defaults are its theme, and so is
// a specifier that does not resolve, such as a bundler alias.
const resolveImport = (spec: string, from: string) => {
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return resolve(dirname(from), spec)
  }
  const match = /^((?:@[\w.-]+\/)?[\w.-]+)(\/.*)?$/.exec(spec)
  if (!match || match[1] === "tailwindcss") {
    return null
  }
  const [, name, subpath = ""] = match
  for (let dir = dirname(from); ; dir = dirname(dir)) {
    const root = join(dir, "node_modules", name)
    const pkg = readPackage(root)
    if (pkg) {
      let file: string | undefined
      if (pkg.exports !== undefined) {
        const target = exportTarget(pkg.exports, `.${subpath}`)
        file = target ? join(root, target) : undefined
      } else {
        const path = join(root, subpath || pkg.style || "index.css")
        file = isFile(path) ? path : `${path}.css`
      }
      return file && isFile(file) ? realpathSync(file) : null
    }
    if (dirname(dir) === dir) {
      return null
    }
  }
}

const importSpecs = (css: string) =>
  Array.from(
    css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g),
    (match) => match[1]
  )

/**
 * The theme scales declared in stylesheets and the files they import, as a
 * config extension: declared names under `extend`, and scales reset with
 * `--<namespace>-*: initial` under `override`. Also returns every file read,
 * so a watcher can rebuild when one changes.
 */
export const themeFromCss = (entries: readonly string[]) => {
  const trees = entries.map((file) => {
    const entry = resolve(file)
    const files: string[] = []
    const declarations: [string, string][] = []
    const visit = (path: string) => {
      if (files.includes(path)) {
        return
      }
      files.push(path)
      let css
      try {
        css = stripComments(readFileSync(path, "utf8"))
      } catch (err) {
        throw new Error(
          `cannot read css ${path === entry ? path : `${path} (imported from ${entry})`}: ${(err as Error).message}`,
          { cause: err }
        )
      }
      // Imports come first in the cascade.
      for (const spec of importSpecs(css)) {
        const target = resolveImport(spec, path)
        if (target) {
          visit(target)
        }
      }
      declarations.push(...themeDeclarations(css))
    }
    visit(entry)
    return { files, declarations }
  })

  // An entry another entry imports is read in that entry's cascade, where
  // a later reset drops its names.
  const partial = (tree: (typeof trees)[number]) =>
    trees.some(
      (other) =>
        other !== tree &&
        other.files.includes(tree.files[0]) &&
        !tree.files.includes(other.files[0])
    )
  const names = new Map<string, Set<string>>()
  const reset = new Set<string>()
  // Whether a tree declares a bare `--spacing`, the multiplier behind
  // `p-4`, after its last spacing reset.
  let multiplier = false
  for (const tree of trees) {
    if (partial(tree)) {
      continue
    }
    const declared = new Map<string, Set<string>>()
    let spacing = false
    for (const [prop, value] of tree.declarations) {
      if (!prop.startsWith("--")) {
        continue
      }
      if (prop === "--*") {
        if (value === "initial") {
          for (const [, scale] of NAMESPACES) {
            reset.add(scale)
          }
          declared.clear()
          spacing = false
        }
        continue
      }
      if (prop === "--spacing") {
        spacing = value !== "initial"
        continue
      }
      const namespace = NAMESPACES.find(([ns]) => prop.startsWith(`--${ns}-`))
      if (!namespace) {
        continue
      }
      const [ns, scale] = namespace
      const name = prop.slice(ns.length + 3)
      if (name === "*") {
        if (value === "initial") {
          reset.add(scale)
          declared.delete(scale)
          if (scale === "spacing") {
            spacing = false
          }
        }
        continue
      }
      // `--text-display--line-height` is a sub-property of `display`.
      if (!name || name.includes("--")) {
        continue
      }
      if (value === "initial") {
        declared.get(scale)?.delete(name)
        continue
      }
      let set = declared.get(scale)
      if (!set) {
        declared.set(scale, (set = new Set()))
      }
      set.add(name)
    }
    for (const [scale, set] of declared) {
      names.set(scale, new Set([...(names.get(scale) ?? []), ...set]))
    }
    multiplier ||= spacing
  }

  const extend: Record<string, string[]> = {}
  const override: Record<string, ClassGroupDef[]> = {}
  for (const [scale, set] of names) {
    if (!reset.has(scale)) {
      extend[scale] = [...set]
    }
  }
  for (const scale of reset) {
    override[scale] = [...(names.get(scale) ?? [])]
  }
  // Tailwind keeps `p-px` through a spacing reset, and a `--spacing`
  // declared after it brings back numeric values such as `p-4`.
  if (override.spacing) {
    override.spacing.unshift("px", ...(multiplier ? [{ $v: "isNumber" }] : []))
  }
  const extension: ConfigExtension = {}
  if (Object.keys(extend).length) {
    extension.extend = { theme: extend }
  }
  if (Object.keys(override).length) {
    extension.override = { theme: override }
  }
  const files = [...new Set(trees.flatMap((tree) => tree.files))]
  return { extension, files }
}
