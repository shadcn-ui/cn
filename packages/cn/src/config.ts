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
import {
  getDefaultCnConfig,
  type DefaultClassGroupIds,
  type DefaultThemeGroupIds,
} from "./default-config.generated.js"
import { createEngine, wrapClsx } from "./engine.js"
import type { CnFunction, Engine } from "./types.js"

export { getDefaultCnConfig as defaultConfig }
export { mergeConfigs }
export type { CnConfig, ClassGroupDef, ConfigExtension, CreateCnInput }
export type { DefaultClassGroupIds, DefaultThemeGroupIds }

// Blocks inference from the config argument, so ids are only ever narrowed by
// explicit type arguments (without them, the `string` default applies).
// Equivalent to TS 5.4's `NoInfer`, which older consumers lack.
type NoInferIds<T> = [T][T extends unknown ? 0 : never]

/**
 * Config input for the factories below: built-in group ids plus the caller's
 * additional ids. With the defaults (`string`) any id is accepted.
 */
type FactoryInput<
  AdditionalClassGroupIds extends string,
  AdditionalThemeGroupIds extends string,
> = CreateCnInput<
  DefaultClassGroupIds | NoInferIds<AdditionalClassGroupIds>,
  DefaultThemeGroupIds | NoInferIds<AdditionalThemeGroupIds>
>

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
 *
 * Pass your custom group ids as type arguments to type-check the config
 * (same generics as tailwind-merge's `extendTailwindMerge`):
 *
 * ```ts
 * const cn = createCn<"heading">({
 *     extend: {
 *         classGroups: { heading: ["h1", "h2"] },
 *         conflictingClassGroups: { heading: ["font-size"] },
 *     },
 * })
 * ```
 */
export const createCn = <
  AdditionalClassGroupIds extends string = string,
  AdditionalThemeGroupIds extends string = string,
>(
  input?: FactoryInput<AdditionalClassGroupIds, AdditionalThemeGroupIds>
): CnFunction => {
  let engine: Engine | null = null
  const getEngine = (): Engine =>
    engine ?? (engine = buildEngine(input as CreateCnInput))
  return wrapClsx((s: string) => getEngine().mergeString(s), {
    seenBefore: (s: string) => getEngine().seenBefore(s),
    mergeUncached: (s: string) => getEngine().mergeUncached(s),
  })
}

/**
 * tailwind-merge–compatible variadic merge for a custom config — the
 * `extendTailwindMerge` migration path.
 */
export const createTwMerge = <
  AdditionalClassGroupIds extends string = string,
  AdditionalThemeGroupIds extends string = string,
>(
  input?: FactoryInput<AdditionalClassGroupIds, AdditionalThemeGroupIds>
): Engine["merge"] => {
  let engine: Engine | null = null
  return function (): string {
    if (engine === null) engine = buildEngine(input as CreateCnInput)

    return engine.merge.apply(null, arguments as never)
  } as Engine["merge"]
}

/**
 * Familiar-name alias for tailwind-merge migrations:
 * `extendTailwindMerge(ext)` ≡ `createTwMerge(ext)`.
 */
export const extendTailwindMerge = createTwMerge
