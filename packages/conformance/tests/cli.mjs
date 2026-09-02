// End-to-end test for `cn build`: scan a fixture project, emit tables,
// verify subset parity for in-corpus classes and passthrough for the rest.
import { execFileSync, spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createCn } from "cn/engine"
import { twMerge as ref } from "tailwind-merge"

const bin = fileURLToPath(new URL("../../cn/bin/cn.mjs", import.meta.url))
const dir = mkdtempSync(join(tmpdir(), "cn-cli-"))
let pass = 0
let fail = 0
const expect = (label, cond, detail = "") => {
  if (cond) pass++
  else {
    fail++
    console.log(`CLI FAIL [${label}] ${detail}`)
  }
}

try {
  // ---- fixture project -----------------------------------------------------
  writeFileSync(
    join(dir, "Button.tsx"),
    `export const Button = ({ active }) => (
            <button className={cn(
                "inline-flex items-center rounded-md px-3 py-2 text-sm font-medium",
                active && "bg-primary text-primary-foreground hover:bg-primary/90",
                "px-4 p-2 text-lg/7 leading-6 -mt-2 w-[13px]"
            )}>x</button>
        )`
  )
  writeFileSync(
    join(dir, "card.html"),
    `<div class="border border-input shadow-sm data-[state=open]:p-2 md:hover:text-red-500"></div>`
  )
  writeFileSync(join(dir, "safelist.txt"), "columns-2 columns-3\n")
  writeFileSync(
    join(dir, "cn.config.mjs"),
    `export default { extend: { classGroups: { "font-size": [{ text: ["hero"] }] } } }\n`
  )

  // ---- subset build ----------------------------------------------------------
  const out1 = execFileSync(
    process.execPath,
    [bin, "build", "--cwd", dir, "-o", "tables-subset.mjs"],
    {
      encoding: "utf8",
    }
  )
  expect("subset-build-runs", out1.includes("class groups kept"), out1)

  const t1 = (await import(pathToFileURL(join(dir, "tables-subset.mjs")).href))
    .default
  const cn1 = createCn(t1)

  // in-corpus classes must merge byte-identically to full tailwind-merge
  const inCorpus = [
    "px-3 px-4",
    "px-4 p-2",
    "p-2 px-4",
    "text-sm text-lg/7",
    "text-lg/7 leading-6",
    "bg-primary hover:bg-primary/90",
    "-mt-2 py-2",
    "w-[13px] px-3",
    "border border-input",
    "shadow-sm rounded-md",
    "data-[state=open]:p-2 data-[state=open]:px-4",
    "md:hover:text-red-500 hover:md:text-sm",
    "inline-flex items-center font-medium text-sm",
  ]
  for (const s of inCorpus) {
    expect(
      "subset-parity",
      cn1(s) === ref(s),
      `${JSON.stringify(s)} → ${JSON.stringify(cn1(s))} vs ${JSON.stringify(ref(s))}`
    )
  }
  // a group absent from the corpus passes through unmerged (its classes have
  // no CSS in this project anyway)
  expect(
    "subset-passthrough",
    cn1("list-disc list-none") === "list-disc list-none",
    cn1("list-disc list-none")
  )

  // ---- safelist brings a group back ------------------------------------------
  execFileSync(process.execPath, [
    bin,
    "build",
    "--cwd",
    dir,
    "-o",
    "tables-safe.mjs",
    "--safelist",
    "safelist.txt",
    "-q",
  ])
  const t2 = (await import(pathToFileURL(join(dir, "tables-safe.mjs")).href))
    .default
  const cn2 = createCn(t2)
  expect(
    "safelist",
    cn2("columns-2 columns-3") === ref("columns-2 columns-3"),
    cn2("columns-2 columns-3")
  )

  // ---- config extension flows into emitted tables ----------------------------
  execFileSync(process.execPath, [
    bin,
    "build",
    "--cwd",
    dir,
    "-o",
    "tables-ext.mjs",
    "--config",
    "cn.config.mjs",
    "--full",
    "-q",
  ])
  const t3 = (await import(pathToFileURL(join(dir, "tables-ext.mjs")).href))
    .default
  const cn3 = createCn(t3)
  expect(
    "config-ext",
    cn3("text-hero text-lg") === "text-lg",
    cn3("text-hero text-lg")
  )
  expect(
    "config-ext-2",
    cn3("text-lg text-hero") === "text-hero",
    cn3("text-lg text-hero")
  )

  // ---- --full parity spot-check ----------------------------------------------
  execFileSync(process.execPath, [
    bin,
    "build",
    "--cwd",
    dir,
    "-o",
    "tables-full.mjs",
    "--full",
    "-q",
  ])
  const t4 = (await import(pathToFileURL(join(dir, "tables-full.mjs")).href))
    .default
  const cn4 = createCn(t4)
  for (const s of [
    "p-2 px-4 p-6",
    "hover:md:p-2 md:hover:p-4",
    "columns-2 columns-3",
    "text-lg/7 text-xl",
  ]) {
    expect("full-parity", cn4(s) === ref(s), JSON.stringify(s))
  }

  // ---- nested fixture tree for --content patterns ----------------------------
  // Each file carries a class from a group nothing else in the fixture uses,
  // so presence in the emitted tables proves the file was scanned. This is
  // added only now, after the subset-build assertions above have already run,
  // because the default glob (no --content) walks the whole fixture dir and
  // would otherwise pull "list-disc" into the subset-passthrough check.
  mkdirSync(join(dir, "src", "ui"), { recursive: true })
  mkdirSync(join(dir, ".storybook"), { recursive: true })
  mkdirSync(join(dir, "out"), { recursive: true })
  mkdirSync(join(dir, "linked-src"), { recursive: true })
  writeFileSync(join(dir, "src", "a.ts"), `const a = "columns-2"`)
  writeFileSync(join(dir, "src", "ui", "b.tsx"), `const b = "list-disc"`)
  writeFileSync(join(dir, "src", "ui", "c.css"), `.x { }`)
  writeFileSync(join(dir, ".storybook", "s.tsx"), `const s = "float-left"`)
  writeFileSync(join(dir, "out", "o.html"), `<i class="clear-both"></i>`)
  writeFileSync(join(dir, "linked-src", "l.tsx"), `const l = "isolate"`)
  symlinkSync(join(dir, "linked-src"), join(dir, "src", "linked"), "junction")
  writeFileSync(
    join(dir, "src", "long.tsx"),
    `const l = "bg-[url(data:image/svg+xml;base64,${"A".repeat(400)})]"`
  )
  // Written here (rather than relying on the pre-extracted-tokens block
  // below) so the out-mkdir case further down can rely on it existing.
  writeFileSync(join(dir, "tokens.txt"), "p-2 px-4 hover:bg-red-500\n")

  // Uses spawnSync (rather than execFileSync) so stderr is captured on a
  // successful (status 0) run too — execFileSync only exposes stderr via
  // the thrown error, which a zero-exit run never throws.
  const run = (argv) => {
    const r = spawnSync(process.execPath, [bin, ...argv], { encoding: "utf8" })
    return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" }
  }
  const groupsOf = async (file) => {
    const t = (await import(pathToFileURL(join(dir, file)).href)).default
    return createCn(t)
  }

  // ---- --content brace globs, explicit dot-dir, symlinks, long tokens ------
  {
    const r = run([
      "build",
      "--cwd",
      dir,
      "--content",
      "src/**/*.{ts,tsx}",
      "-o",
      "t-brace.mjs",
      "-q",
    ])
    expect("content-brace-exit", r.status === 0, r.stderr)
    const c = await groupsOf("t-brace.mjs")
    expect(
      "content-brace-ts",
      c("columns-2 columns-3") === ref("columns-2 columns-3")
    )
    expect(
      "content-brace-tsx",
      c("list-disc list-none") === ref("list-disc list-none")
    )
    // c.css did not match the pattern, and .storybook was not named.
    expect(
      "content-brace-excludes-dotdir",
      c("float-left float-right") === "float-left float-right"
    )
    // The symlinked directory under src/ was followed.
    expect(
      "content-symlink",
      c("isolate isolation-auto") === ref("isolate isolation-auto")
    )
    // A 400+ char arbitrary value was not dropped by a length cap.
    expect(
      "content-long-token",
      c("bg-[url(x)] bg-red-500") === ref("bg-[url(x)] bg-red-500")
    )
  }
  {
    const r = run([
      "build",
      "--cwd",
      dir,
      "--content",
      ".storybook/**/*.tsx,out/**/*.html",
      "-o",
      "t-dot.mjs",
      "-q",
    ])
    expect("content-dotdir-exit", r.status === 0, r.stderr)
    const c = await groupsOf("t-dot.mjs")
    expect(
      "content-dotdir-scanned",
      c("float-left float-right") === ref("float-left float-right")
    )
    expect(
      "content-ignored-dir-named",
      c("clear-both clear-left") === ref("clear-both clear-left")
    )
  }
  {
    // Comma-separated list without braces still works.
    const r = run([
      "build",
      "--cwd",
      dir,
      "--content",
      "src/*.ts,src/ui/*.tsx",
      "-o",
      "t-comma.mjs",
      "-q",
    ])
    expect("content-comma-exit", r.status === 0, r.stderr)
  }

  // ---- error paths use the cn: prefix and exit 1 ----------------------------
  const errCase = (label, argv, needle) => {
    const r = run(argv)
    expect(
      label,
      r.status === 1 &&
        r.stderr.startsWith("cn: ") &&
        r.stderr.includes(needle),
      `${r.status} ${r.stderr}`
    )
  }
  errCase("err-unknown-command", ["frobnicate"], "unknown command")
  errCase("err-unknown-option", ["build", "--nope"], "unknown option")
  errCase("err-missing-value", ["build", "--content"], "missing value")
  errCase(
    "err-unclosed-brace",
    ["build", "--cwd", dir, "--content", "src/*.{ts"],
    "unclosed {"
  )
  errCase(
    "err-no-match",
    ["build", "--cwd", dir, "--content", "nothing/**/*.zzz"],
    "no files matched"
  )
  errCase(
    "err-bad-safelist",
    ["build", "--cwd", dir, "--safelist", "missing.txt"],
    "missing.txt"
  )
  errCase(
    "err-bad-tokens",
    ["build", "--cwd", dir, "--tokens", "missing.txt"],
    "missing.txt"
  )
  errCase(
    "err-bad-config",
    ["build", "--cwd", dir, "--config", "missing.mjs", "--full"],
    "missing.mjs"
  )
  writeFileSync(join(dir, "noexport.mjs"), "export const x = 1\n")
  errCase(
    "err-config-no-default",
    ["build", "--cwd", dir, "--config", "noexport.mjs", "--full"],
    "no default export"
  )

  // ---- output directory is created; help and version --------------------------
  {
    const r = run([
      "build",
      "--cwd",
      dir,
      "--tokens",
      "tokens.txt",
      "-o",
      "deep/nested/t.mjs",
      "-q",
    ])
    expect(
      "out-mkdir",
      r.status === 0 && existsSync(join(dir, "deep", "nested", "t.mjs")),
      r.stderr
    )
  }
  {
    const r = run(["--help"])
    expect(
      "help",
      r.status === 0 && r.stdout.includes("Usage: cn build"),
      r.stdout
    )
  }
  {
    const pkg = JSON.parse(
      readFileSync(new URL("../../cn/package.json", import.meta.url), "utf8")
    )
    const r = run(["--version"])
    expect(
      "version",
      r.status === 0 && r.stdout.trim() === pkg.version,
      r.stdout
    )
  }

  // ---- unreadable files are reported, not hidden -----------------------------
  if (process.platform !== "win32" && process.getuid?.() !== 0) {
    writeFileSync(join(dir, "src", "secret.tsx"), `const s = "sr-only"`)
    chmodSync(join(dir, "src", "secret.tsx"), 0o000)
    const r = run([
      "build",
      "--cwd",
      dir,
      "--content",
      "src/**/*.tsx",
      "-o",
      "t-unread.mjs",
    ])
    expect(
      "unreadable-warned",
      r.status === 0 && r.stderr.includes("skipped 1 unreadable"),
      r.stderr
    )
    chmodSync(join(dir, "src", "secret.tsx"), 0o644)
  }

  // ---- pre-extracted tokens mode ----------------------------------------------
  writeFileSync(join(dir, "tokens.txt"), "p-2 px-4 hover:bg-red-500\n")
  execFileSync(process.execPath, [
    bin,
    "build",
    "--cwd",
    dir,
    "-o",
    "tables-tok.mjs",
    "--tokens",
    "tokens.txt",
    "-q",
  ])
  const t5 = (await import(pathToFileURL(join(dir, "tables-tok.mjs")).href))
    .default
  const cn5 = createCn(t5)
  expect("tokens-mode", cn5("p-2 px-4") === ref("p-2 px-4"), cn5("p-2 px-4"))

  // ---- .ts output is emitted with annotations ----------------------------------
  execFileSync(process.execPath, [
    bin,
    "build",
    "--cwd",
    dir,
    "-o",
    "tables.ts",
    "--tokens",
    "tokens.txt",
    "-q",
  ])
  const tsSource = (await import("node:fs")).readFileSync(
    join(dir, "tables.ts"),
    "utf8"
  )
  expect(
    "ts-output",
    tsSource.includes("(s: string, o = 0): Int32Array"),
    "missing TS annotations"
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(`cli: pass ${pass}  fail ${fail}`)
process.exit(fail > 0 ? 1 : 0)
