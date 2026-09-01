// Post-build gate for the published type surface. Type-checks a consumer
// fixture against dist/ through the real package.json `exports` map — the
// ESM fixture resolves each entry's `import` types (.d.ts), the CJS fixture
// the `require` types (.d.cts). Fails the build on what 0.2.1 shipped:
// an entry's types resolving to an internal chunk with mangled export names,
// and signatures narrower than the documented surface (zero-param `clsx`).
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const pkgRoot = fileURLToPath(new URL("..", import.meta.url))

// Every public name of every entry, exercised with the argument shapes the
// README documents. Adding an export? Add it here so the gate covers it.
const fixture = `
import {
  cn, twMerge, clsx, createEngine, twJoin,
  type ClassArray, type ClassDictionary, type ClassNameArray,
  type ClassNameValue, type ClassValue, type CnConfig, type CnFunction,
  type ConfigExtension, type CreateCnInput, type Engine, type EngineOptions,
  type Tables, type ValidatorImpls,
} from "cn"
import {
  clsx as engineClsx, createCn as engineCreateCn,
  createEngine as engineCreateEngine, twJoin as engineTwJoin, wrapClsx,
} from "cn/engine"
import tables from "cn/tables"
import {
  createCn, createTwMerge, defaultConfig, extendTailwindMerge, fromTheme,
  mergeConfigs, validators,
  type ClassGroupDef, type DefaultClassGroupIds, type DefaultThemeGroupIds,
} from "cn/config"
import {
  compileModel, compileStats, compileToSource, compileToTables, subsetConfig,
  type CompileStats, type CompiledTables, type EmitOptions, type SubsetResult,
} from "cn/compiler"
import liteDefault, { clsx as liteClsx } from "cn/lite"

// clsx-style variadic signatures (0.2.1 published lite's clsx as \`(): string\`)
const sigs: ((...inputs: ClassValue[]) => string)[] = [
  cn, clsx, liteClsx, liteDefault, engineClsx,
]
void sigs
cn("p-2", ["p-4", { "text-sm": true }], undefined, 0, false && "x")
liteClsx("a", false && "b", ["c"], null)
twMerge("p-2 p-4", ["px-1", ["px-2"]])
twJoin("a", ["b"], undefined)
void engineTwJoin("a")

// engine: compiled-tables pairing from the README
const engine: Engine = createEngine(tables)
void engineCreateEngine(tables)
engine.merge("p-2", "p-4")
engine.mergeString("p-2 p-4")
const bound: CnFunction = engineCreateCn(tables)
bound("p-2", { "p-4": true })
wrapClsx(engine.mergeString)("p-2", ["p-4"])

// config: custom-config surface
const config: CnConfig = defaultConfig()
const ext: ConfigExtension = {
  extend: { classGroups: { "font-size": [{ text: ["hero"] }] } },
}
const merged: CnConfig = mergeConfigs(config, ext)
const input: CreateCnInput = ext
createCn(input)("p-2")
createCn((c: CnConfig) => c)("p-2")
createTwMerge(ext)("p-2 p-4")
extendTailwindMerge(ext)("p-2 p-4")
const themeRef: { $t: string } = fromTheme("spacing")
const marker: { readonly $v: "isNumber" } = validators.isNumber
const groupId: DefaultClassGroupIds = "aspect"
const themeId: DefaultThemeGroupIds = "spacing"
void [themeRef, marker, groupId, themeId]

// compiler
const compiled: CompiledTables = compileToTables(merged)
createEngine(compiled.tables, compiled.validatorImpls)
const emit: EmitOptions = { lang: "ts" }
const source: string = compileToSource(merged, emit)
void compileModel(merged)
const stats: CompileStats = compileStats(merged)
const subset: SubsetResult = subsetConfig(merged, ["p-2", "text-sm"])
void [source, stats, subset]

// type-only exports stay importable from every entry that declares them
const groupDef: ClassGroupDef = { $t: "spacing" }
const values: [
  ClassArray, ClassDictionary, ClassNameArray, ClassNameValue, ClassValue,
  EngineOptions, Tables, ValidatorImpls,
] = [[], {}, [], "x", "y", {}, tables, {}]
void [groupDef, values]
`

const dir = mkdtempSync(join(tmpdir(), "cn-check-dts-"))
try {
  mkdirSync(join(dir, "node_modules"))
  symlinkSync(pkgRoot, join(dir, "node_modules", "cn"), "junction")
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }))
  writeFileSync(join(dir, "fixture.ts"), fixture)
  writeFileSync(join(dir, "fixture.cts"), fixture)

  const program = ts.createProgram(
    [join(dir, "fixture.ts"), join(dir, "fixture.cts")],
    {
      strict: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
      lib: ["lib.es2022.d.ts"],
      types: [],
    }
  )
  const diagnostics = ts.getPreEmitDiagnostics(program)
  if (diagnostics.length > 0) {
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCurrentDirectory: () => dir,
        getCanonicalFileName: (f) => f,
        getNewLine: () => "\n",
      })
    )
    console.error(
      `check-dts: ${diagnostics.length} error(s) — the type declarations in dist/ do not match the public surface`
    )
    process.exit(1)
  }
  console.log(
    "check-dts: entry declarations OK (import/.d.ts and require/.d.cts)"
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
