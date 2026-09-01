// Custom-config entry (`cn/config`, re-exported from `cn`): create a `cn`
// with a tailwind-merge–style config extension, compiled at first call
// (~3 ms once, then full engine speed). For zero-compile production setups,
// run the compiler at build time instead (`npx cn build`) and pair the
// emitted tables with `createCn` from `cn/engine`.

import {
  compileToTables,
  mergeConfigs,
  type CnConfig,
  type ClassGroupDef,
  type ConfigExtension,
  type CreateCnInput,
} from "./compiler.js"
import { getDefaultCnConfig } from "./default-config.generated.js"
import { createEngine, wrapClsx } from "./engine.js"
import type { CnFunction, Engine } from "./types.js"

export { getDefaultCnConfig as defaultConfig }
export { mergeConfigs }
export type { CnConfig, ClassGroupDef, ConfigExtension, CreateCnInput }
export type {
  DefaultClassGroupIds,
  DefaultThemeGroupIds,
} from "./default-config.generated.js"

/** Reference a theme scale from a class-group definition. */
export const fromTheme = (key: string): { $t: string } => ({ $t: key })

/**
 * Marker-form validators for custom class groups (compiled to allocation-free
 * span opcodes — prefer these over passing tailwind-merge's validator
 * functions, which run as slower custom validators).
 */
export const validators = {
  isAny: { $v: "isAny" },
  isAnyNonArbitrary: { $v: "isAnyNonArbitrary" },
  isArbitraryValue: { $v: "isArbitraryValue" },
  isArbitraryVariable: { $v: "isArbitraryVariable" },
  isFraction: { $v: "isFraction" },
  isNumber: { $v: "isNumber" },
  isInteger: { $v: "isInteger" },
  isPercent: { $v: "isPercent" },
  isTshirtSize: { $v: "isTshirtSize" },
  isNamedContainerQuery: { $v: "isNamedContainerQuery" },
  isArbitraryLength: { $v: "isArbitraryLength" },
  isArbitraryNumber: { $v: "isArbitraryNumber" },
  isArbitraryWeight: { $v: "isArbitraryWeight" },
  isArbitraryFamilyName: { $v: "isArbitraryFamilyName" },
  isArbitraryPosition: { $v: "isArbitraryPosition" },
  isArbitrarySize: { $v: "isArbitrarySize" },
  isArbitraryImage: { $v: "isArbitraryImage" },
  isArbitraryShadow: { $v: "isArbitraryShadow" },
  isArbitraryVariableLength: { $v: "isArbitraryVariableLength" },
  isArbitraryVariableFamilyName: { $v: "isArbitraryVariableFamilyName" },
  isArbitraryVariablePosition: { $v: "isArbitraryVariablePosition" },
  isArbitraryVariableSize: { $v: "isArbitraryVariableSize" },
  isArbitraryVariableImage: { $v: "isArbitraryVariableImage" },
  isArbitraryVariableShadow: { $v: "isArbitraryVariableShadow" },
  isArbitraryVariableWeight: { $v: "isArbitraryVariableWeight" },
} as const

const isFullConfig = (input: object): input is CnConfig =>
  "classGroups" in input &&
  "theme" in input &&
  "conflictingClassGroups" in input

const resolveConfig = (
  input?: CreateCnInput
): { config: CnConfig; cacheSize?: number } => {
  if (input === undefined) return { config: getDefaultCnConfig() }
  if (typeof input === "function")
    return { config: input(getDefaultCnConfig()) }
  if (isFullConfig(input)) return { config: input }
  return {
    config: mergeConfigs(getDefaultCnConfig(), input),
    cacheSize: input.cacheSize,
  }
}

const buildEngine = (input?: CreateCnInput): Engine => {
  const { config, cacheSize } = resolveConfig(input)
  const { tables, validatorImpls, prefix } = compileToTables(config)
  return createEngine(tables, validatorImpls, { cacheSize, prefix })
}

/**
 * Create a `cn` function for a custom config. Accepts a tailwind-merge–style
 * `{ extend, override, prefix }` extension, a `(defaultConfig) => config`
 * transform, or a complete config. Compilation is lazy: the first call pays
 * ~3 ms once, every later call runs at full engine speed.
 *
 * ```ts
 * const cn = createCn({
 *     extend: { classGroups: { "font-size": [{ text: ["hero", "tiny"] }] } },
 * })
 * ```
 */
export const createCn = (input?: CreateCnInput): CnFunction => {
  let inner: CnFunction | null = null
  return wrapClsx((s: string) => {
    if (inner === null) {
      const engine = buildEngine(input)
      inner = engine.mergeString as CnFunction
    }
    return (inner as (s: string) => string)(s)
  })
}

/**
 * tailwind-merge–compatible variadic merge for a custom config — the
 * `extendTailwindMerge` migration path.
 */
export const createTwMerge = (input?: CreateCnInput): Engine["merge"] => {
  let engine: Engine | null = null
  return function (): string {
    if (engine === null) engine = buildEngine(input)

    return engine.merge.apply(null, arguments as never)
  } as Engine["merge"]
}

/**
 * Familiar-name alias for tailwind-merge migrations:
 * `extendTailwindMerge(ext)` ≡ `createTwMerge(ext)`.
 */
export const extendTailwindMerge = createTwMerge
