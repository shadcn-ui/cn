// `css`: the theme scales a Tailwind v4 stylesheet declares are registered at
// build time, so a custom name conflicts like a default one.
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { build, createBuilder } from "cn/build"
import { createCn } from "cn/engine"
import { extendTailwindMerge } from "tailwind-merge"

const bin = fileURLToPath(new URL("../../cn/bin/cn.mjs", import.meta.url))
const dir = mkdtempSync(join(tmpdir(), "cn-theme-css-"))

const write = (rel, text) => {
  mkdirSync(join(dir, rel, ".."), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

const load = async (out) =>
  createCn(
    (await import(`${pathToFileURL(join(dir, out)).href}?t=${Date.now()}`))
      .default
  )

// The same declarations, registered by hand with tailwind-merge.
const ref = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["card", "pill"],
      shadow: ["panel"],
      text: ["display", "eyebrow"],
      "font-weight": ["heavy"],
      tracking: ["display"],
      leading: ["display"],
      spacing: ["gutter"],
      breakpoint: ["wide"],
      container: ["prose"],
      animate: ["shimmer"],
      ease: ["snappy"],
      blur: ["glass"],
      "drop-shadow": ["lift"],
      "inset-shadow": ["well"],
      "text-shadow": ["crisp"],
      perspective: ["stage"],
      aspect: ["poster"],
    },
  },
})

write(
  "app/globals.css",
  `@import "tailwindcss";
@import "./theme.css" layer(theme);
@import url("./tokens/type.css");

/* --radius-legacy: 2px; a comment is not a declaration */
@theme {
  --radius-card: 1.25rem;
  --radius-pill: 9999px;
  --shadow-panel: 0 30px 70px -20px rgb(0 0 0 / 0.75);
  --color-brand: oklch(0.6 0.2 250);
  --font-display: "Inter", sans-serif;
  --font-weight-heavy: 650;
  --spacing-gutter: 2rem;
  --breakpoint-wide: 96rem;
  --container-prose: 65ch;
  --ease-snappy: cubic-bezier(0.2, 0, 0, 1);
  --blur-glass: 12px;
  --drop-shadow-lift: 0 4px 8px rgb(0 0 0 / 0.2);
  --inset-shadow-well: inset 0 2px 4px rgb(0 0 0 / 0.2);
  --text-shadow-crisp: 0 1px 0 #fff;
  --perspective-stage: 1200px;
  --aspect-poster: 2 / 3;
}

@layer base {
  @theme inline {
    --animate-shimmer: shimmer 2s linear infinite;
  }
}
`
)
write(
  "app/theme.css",
  `@theme {
  --tracking-display: -0.02em;
  --leading-display: 1.05;
}
`
)
write(
  "app/tokens/type.css",
  `@theme inline {
  --text-display: 3rem;
  --text-display--line-height: 1.1;
  --text-display--letter-spacing: -0.02em;
  --text-eyebrow: 0.75rem;
}
`
)
write(
  "src/App.tsx",
  `const a = "rounded-card rounded-lg rounded-pill shadow-panel shadow-sm text-display text-sm text-eyebrow
font-display font-bold font-heavy p-gutter p-4 max-w-wide max-w-md columns-prose columns-3 animate-shimmer animate-spin
ease-snappy ease-in blur-glass blur-sm drop-shadow-lift drop-shadow-md inset-shadow-well inset-shadow-sm
text-shadow-crisp text-shadow-sm perspective-stage perspective-near aspect-poster aspect-video
tracking-display tracking-tight leading-display leading-tight bg-brand bg-red-500 text-brand text-red-500"`
)

const merges = [
  "rounded-card rounded-lg",
  "rounded-lg rounded-card",
  "rounded-card rounded-pill",
  "shadow-panel shadow-sm",
  "text-display text-sm",
  "text-sm text-eyebrow",
  "text-display text-brand",
  "text-brand text-display",
  "font-display font-bold",
  "font-bold font-display",
  "font-heavy font-bold",
  "font-bold font-heavy",
  "font-heavy font-display",
  "p-gutter p-4",
  "max-w-wide max-w-md",
  "columns-prose columns-3",
  "animate-shimmer animate-spin",
  "ease-snappy ease-in",
  "blur-glass blur-sm",
  "drop-shadow-lift drop-shadow-md",
  "inset-shadow-well inset-shadow-sm",
  "text-shadow-crisp text-shadow-sm",
  "perspective-stage perspective-near",
  "aspect-poster aspect-video",
  "tracking-display tracking-tight",
  "leading-display leading-tight",
  "bg-brand bg-red-500",
  "hover:rounded-card hover:rounded-lg",
  "rounded-card! rounded-lg!",
  "rounded-card hover:rounded-lg",
  "rounded-legacy rounded-lg",
]

try {
  const result = await build({
    cwd: dir,
    css: "app/globals.css",
    content: ["src/**/*.tsx"],
    out: "cn-tables.mjs",
  })
  assert.deepEqual(
    result.cssFiles.map((f) => f.slice(dir.length + 1)),
    ["app/globals.css", "app/theme.css", "app/tokens/type.css"],
    "every stylesheet read is reported, entry first"
  )
  assert.deepEqual(
    result.fullConfig.theme.radius.slice(-2),
    ["card", "pill"],
    "declared names extend the scale"
  )
  assert.ok(
    !result.fullConfig.theme.text.includes("display--line-height"),
    "sub-properties are not names"
  )
  assert.ok(
    !result.fullConfig.theme.color.includes("brand"),
    "colors are not registered"
  )
  const cn = await load("cn-tables.mjs")
  for (const input of merges) {
    assert.equal(cn(input), ref(input), `subset: ${input}`)
  }
  assert.equal(cn("rounded-card rounded-lg"), "rounded-lg")
  assert.equal(cn("font-display font-bold"), "font-display font-bold")
  assert.equal(cn("font-heavy font-bold"), "font-bold")
  assert.equal(cn("rounded-legacy rounded-lg"), "rounded-legacy rounded-lg")

  // A reset replaces the default scale with the declared names.
  write(
    "app/reset.css",
    `@theme {
  --radius-*: initial;
  --radius-card: 1.25rem;
  --shadow-*: initial;
}
`
  )
  const reset = await build({
    cwd: dir,
    css: "app/reset.css",
    full: true,
    out: "reset.mjs",
  })
  assert.deepEqual(reset.fullConfig.theme.radius, ["card"])
  assert.deepEqual(reset.fullConfig.theme.shadow, [])
  const cnReset = await load("reset.mjs")
  const refReset = extendTailwindMerge({
    override: { theme: { radius: ["card"], shadow: [] } },
  })
  for (const input of [
    "rounded-card rounded-lg",
    "rounded-lg rounded-card",
    "rounded-card rounded-none",
    "shadow-sm shadow-md",
    "shadow shadow-none",
  ]) {
    assert.equal(cnReset(input), refReset(input), `reset: ${input}`)
  }
  assert.equal(cnReset("rounded-lg rounded-card"), "rounded-lg rounded-card")

  // `--*: initial` resets every scale.
  write("app/bare.css", `@theme {\n  --*: initial;\n  --text-body: 1rem;\n}\n`)
  const bare = await build({
    cwd: dir,
    css: "app/bare.css",
    full: true,
    out: "bare.mjs",
  })
  assert.deepEqual(bare.fullConfig.theme.text, ["body"])
  assert.deepEqual(bare.fullConfig.theme.radius, [])
  assert.deepEqual(
    bare.fullConfig.theme.color,
    result.fullConfig.theme.color,
    "colors keep accepting any name"
  )

  // An explicit config extension is applied after the stylesheet.
  write(
    "cn.config.mjs",
    `export default { override: { theme: { radius: ["only"] } } }`
  )
  const layered = await build({
    cwd: dir,
    css: "app/globals.css",
    config: "cn.config.mjs",
    full: true,
    out: "layered.mjs",
  })
  assert.deepEqual(layered.fullConfig.theme.radius, ["only"])
  assert.ok(layered.fullConfig.theme.shadow.includes("panel"))

  // The builder rebuilds when a stylesheet it read changes.
  const builder = createBuilder({
    cwd: dir,
    css: "app/globals.css",
    content: ["src/**/*.tsx"],
    out: "watch.mjs",
  })
  const first = await builder.run()
  assert.equal(await builder.changed(join(dir, "README.md")), first)
  write(
    "app/theme.css",
    `@theme {\n  --tracking-display: -0.02em;\n  --leading-display: 1.05;\n  --radius-chip: 4px;\n}\n`
  )
  const second = await builder.changed(join(dir, "app", "theme.css"))
  assert.notEqual(second, first, "a stylesheet change rebuilds")
  assert.ok(second.fullConfig.theme.radius.includes("chip"))

  // Errors name the file.
  await assert.rejects(
    build({ cwd: dir, css: "app/missing.css", full: true, out: "x.mjs" }),
    /cannot read css .*missing\.css/
  )
  write("app/broken.css", `@import "./nope.css";`)
  await assert.rejects(
    build({ cwd: dir, css: "app/broken.css", full: true, out: "x.mjs" }),
    /cannot read css .*nope\.css \(imported from .*broken\.css\)/
  )

  // The CLI flag reaches build().
  execFileSync(process.execPath, [
    bin,
    "build",
    "--cwd",
    dir,
    "--css",
    "app/globals.css",
    "--content",
    "src/**/*.tsx",
    "-o",
    "cli.mjs",
    "-q",
  ])
  const cnCli = await load("cli.mjs")
  assert.equal(cnCli("rounded-card rounded-lg"), "rounded-lg")
  const failed = spawnSync(
    process.execPath,
    [bin, "build", "--cwd", dir, "--css", "app/missing.css", "--full"],
    { encoding: "utf8" }
  )
  assert.equal(failed.status, 1, "missing css fails the CLI")
  assert.match(failed.stderr, /cn: cannot read css .*missing\.css/)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// Without `css`, every stylesheet under cwd that imports Tailwind or declares
// a theme is read, and nothing else is.
const root = mkdtempSync(join(tmpdir(), "cn-theme-css-discovery-"))
const writeIn = (rel, text) => {
  mkdirSync(join(root, rel, ".."), { recursive: true })
  writeFileSync(join(root, rel), text)
}
const loadIn = async (out) =>
  createCn(
    (await import(`${pathToFileURL(join(root, out)).href}?t=${Date.now()}`))
      .default
  )
try {
  writeIn(
    "app/globals.css",
    `@import "tailwindcss";\n@theme {\n  --radius-card: 1.25rem;\n}\n`
  )
  writeIn(
    "packages/ui/styles.css",
    `@theme inline {\n  --shadow-panel: 0 1px 2px #000;\n}\n`
  )
  writeIn(
    "styles/plain.css",
    `:root {\n  --radius-nope: 2px;\n}\n.x {\n  --text-nope: 1rem;\n}\n`
  )
  writeIn(
    "node_modules/some-pkg/theme.css",
    `@theme {\n  --radius-ignored: 1px;\n}\n`
  )
  writeIn("dist/app.css", `@theme {\n  --radius-built: 1px;\n}\n`)
  writeIn(
    "src/App.tsx",
    `const a = "rounded-card rounded-lg shadow-panel shadow-sm"`
  )

  const found = await build({
    cwd: root,
    content: ["src/**/*.tsx"],
    out: "found.mjs",
  })
  assert.deepEqual(
    found.cssFiles.map((f) => f.slice(root.length + 1)).sort(),
    ["app/globals.css", "packages/ui/styles.css"],
    "discovery reads Tailwind entries and theme files only"
  )
  assert.ok(found.fullConfig.theme.radius.includes("card"))
  assert.ok(found.fullConfig.theme.shadow.includes("panel"))
  for (const name of ["nope", "ignored", "built"]) {
    assert.ok(!found.fullConfig.theme.radius.includes(name), `no ${name}`)
  }
  const cnFound = await loadIn("found.mjs")
  assert.equal(cnFound("rounded-card rounded-lg"), "rounded-lg")
  assert.equal(cnFound("shadow-panel shadow-sm"), "shadow-sm")

  // A pinned file reads that file only.
  const pinned = await build({
    cwd: root,
    css: "packages/ui/styles.css",
    full: true,
    out: "pinned.mjs",
  })
  assert.deepEqual(
    pinned.cssFiles.map((f) => f.slice(root.length + 1)),
    ["packages/ui/styles.css"]
  )
  assert.ok(!pinned.fullConfig.theme.radius.includes("card"))

  // `false` reads nothing.
  const off = await build({ cwd: root, css: false, full: true, out: "off.mjs" })
  assert.deepEqual(off.cssFiles, [])
  assert.ok(!off.fullConfig.theme.radius.includes("card"))

  // A project with no stylesheet builds as before.
  const bare = await build({
    cwd: join(root, "src"),
    content: ["**/*.tsx"],
    out: "bare.mjs",
  })
  assert.deepEqual(bare.cssFiles, [])

  // The builder rebuilds for a new theme file, and not for a plain one.
  const builder = createBuilder({
    cwd: root,
    content: ["src/**/*.tsx"],
    out: "watch.mjs",
  })
  const first = await builder.run()
  writeIn("styles/more-plain.css", `.y {\n  color: red;\n}\n`)
  assert.equal(
    await builder.changed(join(root, "styles", "more-plain.css")),
    first,
    "a plain stylesheet does not rebuild"
  )
  writeIn("app/tokens.css", `@theme {\n  --radius-chip: 4px;\n}\n`)
  const second = await builder.changed(join(root, "app", "tokens.css"))
  assert.notEqual(second, first, "a new theme file rebuilds")
  assert.ok(second.fullConfig.theme.radius.includes("chip"))
  writeIn(
    "node_modules/some-pkg/theme.css",
    `@theme {\n  --radius-x: 1px;\n}\n`
  )
  assert.equal(
    await builder.changed(join(root, "node_modules", "some-pkg", "theme.css")),
    second,
    "an ignored directory does not rebuild"
  )

  // The CLI discovers by default and `--no-css` turns it off.
  execFileSync(process.execPath, [
    bin,
    "build",
    "--cwd",
    root,
    "--content",
    "src/**/*.tsx",
    "-o",
    "cli.mjs",
    "-q",
  ])
  assert.equal(
    (await loadIn("cli.mjs"))("rounded-card rounded-lg"),
    "rounded-lg"
  )
  execFileSync(process.execPath, [
    bin,
    "build",
    "--cwd",
    root,
    "--no-css",
    "--content",
    "src/**/*.tsx",
    "-o",
    "cli-off.mjs",
    "-q",
  ])
  assert.equal(
    (await loadIn("cli-off.mjs"))("rounded-card rounded-lg"),
    "rounded-card rounded-lg"
  )
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log(`theme-css: ${merges.length} merges and the build cases passed`)
