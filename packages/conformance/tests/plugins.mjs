// End-to-end tests for the builder and the bundler plugins: tables exist
// before the first module resolves, an edit that only reuses known classes
// leaves the file alone, and an edit that reaches a dropped class group
// regenerates it. Plugin hooks are called directly with the shapes Vite and
// Next.js pass, so no bundler is installed here.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { cn as reference } from "cn"
import { createBuilder, createContentMatcher } from "cn/build"
import { createCn } from "cn/engine"
import { withCn } from "cn/next"
import { cn as cnVite } from "cn/vite"

let pass = 0
let fail = 0
const expect = (label, cond, detail = "") => {
  if (cond) pass++
  else {
    fail++
    console.log(`PLUGINS FAIL [${label}] ${detail}`)
  }
}

// Each fixture project gets its own directory and output file, and every
// import of a generated module gets a cache-busting query so a rewritten
// file is re-evaluated.
let stamp = 0
const project = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `cn-${name}-`))
  mkdirSync(join(dir, "src", "lib"), { recursive: true })
  writeFileSync(
    join(dir, "src", "Button.tsx"),
    `export const Button = () => <button className={cn("rounded-md px-4 py-2 text-sm bg-primary")} />`
  )
  return dir
}
const load = async (file) => {
  const url = pathToFileURL(file).href + `?v=${++stamp}`
  return createCn((await import(url)).default)
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (check, timeout = 4000) => {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    if (await check()) return true
    await settle(50)
  }
  return check()
}

const dirs = []
try {
  // ---- content matcher mirrors the scanner's rules --------------------------
  {
    const cwd = "/proj"
    const m = createContentMatcher(["src/**/*.{ts,tsx}", "out/**/*.html"], cwd)
    expect("match-glob", m("/proj/src/ui/a.tsx"))
    expect("match-ext", !m("/proj/src/ui/a.css"))
    expect("match-outside", !m("/other/src/a.ts"))
    expect("match-dotdir", !m("/proj/src/.cache/a.ts"))
    expect("match-ignored", !m("/proj/src/node_modules/x/a.ts"))
    expect("match-opt-in", m("/proj/out/index.html"))
    const lit = createContentMatcher(["src", "cn.config.mjs"], cwd)
    expect("match-literal-dir", lit("/proj/src/deep/a.vue"))
    expect("match-literal-file", lit("/proj/cn.config.mjs"))
    expect("match-literal-miss", !lit("/proj/lib/a.ts"))
    const any = createContentMatcher(["**/*.tsx"], cwd)
    expect("match-default-prunes", !any("/proj/node_modules/pkg/a.tsx"))
    expect("match-default-root", any("/proj/a.tsx"))
  }

  // ---- builder: rebuild only when an edit reaches a dropped group ----------
  {
    const dir = project("builder")
    dirs.push(dir)
    const out = join(dir, "src", "lib", "cn-tables.mjs")
    const builder = createBuilder({
      cwd: dir,
      content: ["src/**/*.{ts,tsx}"],
      out: "src/lib/cn-tables.mjs",
    })
    expect("builder-before-run", builder.last === null)
    const first = await builder.run()
    expect("builder-writes", existsSync(out) && first.changed)
    expect("builder-last", builder.last === first)
    const merge1 = await load(out)
    expect("builder-parity", merge1("px-4 px-2") === reference("px-4 px-2"))
    expect(
      "builder-subset",
      merge1("list-disc list-none") === "list-disc list-none"
    )

    // Same classes again: no rebuild, and the file is untouched.
    const mtime = statSync(out).mtimeMs
    writeFileSync(
      join(dir, "src", "Card.tsx"),
      `export const Card = () => <div className={cn("px-4 text-sm")} />`
    )
    const same = await builder.changed(join(dir, "src", "Card.tsx"))
    expect("builder-known-tokens-skip", same === first)
    expect("builder-file-untouched", statSync(out).mtimeMs === mtime)

    // Paths the scanner would not read never trigger a rebuild.
    expect("builder-out-skip", (await builder.changed(out)) === first)
    writeFileSync(join(dir, "README.md"), `list-disc`)
    expect(
      "builder-outside-globs-skip",
      (await builder.changed(join(dir, "README.md"))) === first
    )
    expect(
      "builder-missing-file-skip",
      (await builder.changed(join(dir, "src", "gone.tsx"))) === first
    )

    // A new class group: rebuild, and the tables now merge it.
    writeFileSync(
      join(dir, "src", "List.tsx"),
      `export const List = () => <ul className={cn("list-disc")} />`
    )
    const second = await builder.changed(join(dir, "src", "List.tsx"))
    expect("builder-rebuilds", second !== first && second.changed)
    const merge2 = await load(out)
    expect(
      "builder-new-group",
      merge2("list-disc list-none") === reference("list-disc list-none"),
      merge2("list-disc list-none")
    )

    // An identical rebuild reports no change and leaves the file alone.
    const mtime2 = statSync(out).mtimeMs
    const third = await builder.run()
    expect("builder-unchanged", third.changed === false)
    expect("builder-unchanged-file", statSync(out).mtimeMs === mtime2)

    // Concurrent runs coalesce and resolve to the latest result.
    const [a, b] = await Promise.all([builder.run(), builder.run()])
    expect("builder-coalesce", a === b && builder.last === a)

    // With --full the tables don't depend on sources.
    const full = createBuilder({ cwd: dir, full: true, out: "full.mjs" })
    const f1 = await full.run()
    writeFileSync(join(dir, "src", "Z.tsx"), `"columns-2"`)
    expect(
      "builder-full-never-rebuilds",
      (await full.changed(join(dir, "src", "Z.tsx"))) === f1
    )

    // Errors surface from run() and from changed().
    let message = ""
    try {
      await createBuilder({ cwd: dir, content: ["nope/**"] }).run()
    } catch (err) {
      message = err.message
    }
    expect("builder-throws", message.includes("no files matched"), message)
  }

  // ---- vite plugin hooks ------------------------------------------------------
  {
    const dir = project("vite")
    dirs.push(dir)
    const out = join(dir, "src", "lib", "cn-tables.ts")
    const plugin = cnVite({
      content: ["src/**/*.{ts,tsx}"],
      out: "src/lib/cn-tables.ts",
    })
    expect("vite-name", plugin.name === "cn:build")
    plugin.configResolved({ root: dir })
    await plugin.buildStart()
    expect("vite-buildstart-writes", existsSync(out))
    expect(
      "vite-ts-output",
      readFileSync(out, "utf8").includes("GENERATED by `cn build`")
    )
    const before = readFileSync(out, "utf8")
    writeFileSync(
      join(dir, "src", "Grid.tsx"),
      `export const Grid = () => <div className={cn("columns-2")} />`
    )
    await plugin.watchChange(join(dir, "src", "Grid.tsx"), { event: "create" })
    expect("vite-watchchange-rebuilds", readFileSync(out, "utf8") !== before)
    await plugin.watchChange(join(dir, "src", "Grid.tsx"), { event: "delete" })
    expect("vite-delete-ignored", existsSync(out))

    // Without configResolved the plugin still works from the given cwd.
    const bare = cnVite({ cwd: dir, out: "bare.mjs", full: true })
    await bare.buildStart()
    expect("vite-bare-cwd", existsSync(join(dir, "bare.mjs")))
  }

  // ---- next wrapper -----------------------------------------------------------
  {
    const dir = project("next")
    dirs.push(dir)
    const out = join(dir, "src", "lib", "cn-tables.ts")
    const options = {
      cwd: dir,
      content: ["src/**/*.{ts,tsx}"],
      out: "src/lib/cn-tables.ts",
    }
    const config = await withCn({ reactStrictMode: true }, options)(
      "phase-production-build",
      {}
    )
    expect("next-returns-config", config.reactStrictMode === true)
    expect("next-build-writes", existsSync(out))

    const fromFn = await withCn(async (phase) => ({ phase }), {
      ...options,
      out: "fn.mjs",
    })("phase-production-build", {})
    expect("next-function-config", fromFn.phase === "phase-production-build")
    expect(
      "next-default-config",
      (await withCn(undefined, { cwd: dir, full: true, out: "d.mjs" })(
        "phase-production-build",
        {}
      )) !== undefined
    )

    // Dev phase watches the project and regenerates on a reaching edit.
    await withCn({}, options)("phase-development-server", {})
    const before = readFileSync(out, "utf8")
    await settle(100)
    writeFileSync(
      join(dir, "src", "Float.tsx"),
      `export const Float = () => <div className={cn("float-left")} />`
    )
    const rebuilt = await waitFor(() => readFileSync(out, "utf8") !== before)
    expect("next-dev-watch-rebuilds", rebuilt)
  }
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
}

console.log(`plugins: pass ${pass}  fail ${fail}`)
if (fail > 0) process.exit(1)
