import tables from "./tables.generated.js"
import { clsx, createEngine, twJoin, wrapClsx } from "./engine.js"

const instance = /* @__PURE__ */ createEngine(tables)

/**
 * Merge Tailwind CSS classes with clsx-style arguments (strings, arrays,
 * objects, conditionals). Drop-in replacement for `twMerge(clsx(...))`.
 */
export const cn = /* @__PURE__ */ wrapClsx(instance.mergeString, instance)

/** tailwind-merge–compatible variadic merge (strings + nested arrays). */
export const twMerge = instance.merge

export { clsx, clsx as cx, createEngine, twJoin }
export {
  cva,
  type ClassProp,
  type ClassPropKey,
  type CvaConfig,
  type CvaProps,
  type CxOptions,
  type CxReturn,
  type OmitUndefined,
  type StringToBoolean,
  type VariantProps,
  type VariantSchema,
} from "./cva.js"

// Custom configs live at "cn/config" (createCn, createTwMerge, fromTheme,
// validators) — a separate entry so the compiler and default-config data
// never enter this one's bundle graph. Compiled project tables pair with
// createCn from "cn/engine". Types come from compiler.ts, not config.ts:
// importing config.ts here would split its declarations into a shared chunk
// whose filename can collide with the `cn/config` entry's own d.ts.
export type { CnConfig, ConfigExtension, CreateCnInput } from "./compiler.js"

export type {
  ClassArray,
  ClassDictionary,
  ClassNameArray,
  ClassNameValue,
  ClassValue,
  CnFunction,
  Engine,
  EngineOptions,
  Tables,
  ValidatorImpls,
} from "./types.js"
