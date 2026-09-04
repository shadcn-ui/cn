import type { clsx } from "./engine.js"
import type { ClassValue } from "./types.js"

const CVA_MEMO_ROW_COUNT = 16
const CVA_MEMO_NARROW_ROW_COUNT = 8
const CVA_MEMO_VALUE_SLOTS_PER_ROW = 16
const CVA_TABLE_MAX_SLOTS = 256
const CVA_MEMO_LANE_NONE = 0
const CVA_MEMO_LANE_FAST = 1
const CVA_MEMO_LANE_WIDE = 2
const CVA_MEMO_FAST_LANE_MAX_PROP_NAMES = 2
const CVA_MEMO_FAST_LANE_SLOTS_PER_ROW = 4

const createFilledArray = <T>(count: number, value: T): T[] => {
  const slots: T[] = []
  for (let index = 0; index < count; index++) slots.push(value)
  return slots
}

const isArray = Array.isArray

const resolveClassValue = (value: ClassValue): string => {
  if (!value) return ""
  if (typeof value === "string") return value
  if (typeof value === "number") return "" + value

  let classList = ""
  if (isArray(value)) {
    const length = value.length
    for (let index = 0; index < length; index++) {
      const classValue = value[index]
      if (!classValue) continue
      const resolvedClassName =
        typeof classValue === "string"
          ? classValue
          : resolveClassValue(classValue)
      if (resolvedClassName) {
        if (classList) classList += " "
        classList += resolvedClassName
      }
    }
    return classList
  }
  if (typeof value === "object") {
    for (const key in value) {
      if (value[key]) {
        if (classList) classList += " "
        classList += key
      }
    }
  }
  return classList
}

export type ClassPropKey = "class" | "className"

export type ClassProp =
  | { class: ClassValue; className?: never }
  | { class?: never; className: ClassValue }
  | { class?: never; className?: never }

export type OmitUndefined<T> = T extends undefined ? never : T

export type StringToBoolean<T> = T extends "true" | "false" ? boolean : T

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional class-variance-authority type parity
export type VariantProps<Component extends (...args: any) => any> = Omit<
  OmitUndefined<Parameters<Component>[0]>,
  ClassPropKey
>

export type CxOptions = Parameters<typeof clsx>
export type CxReturn = ReturnType<typeof clsx>

export type VariantSchema = Record<string, Record<string, ClassValue>>

type SchemaVariants<T extends VariantSchema> = {
  [Variant in keyof T]?: StringToBoolean<keyof T[Variant]> | null | undefined
}

type SchemaVariantsMulti<T extends VariantSchema> = {
  [Variant in keyof T]?:
    | StringToBoolean<keyof T[Variant]>
    | StringToBoolean<keyof T[Variant]>[]
    | undefined
}

export type CvaConfig<T> = T extends VariantSchema
  ? {
      variants?: T
      defaultVariants?: SchemaVariants<T>
      compoundVariants?: (T extends VariantSchema
        ? (SchemaVariants<T> | SchemaVariantsMulti<T>) & ClassProp
        : ClassProp)[]
    }
  : never

export type CvaProps<T> = T extends VariantSchema
  ? SchemaVariants<T> & ClassProp
  : ClassProp

interface RuntimeCvaProps {
  [propName: string]: unknown
  class?: ClassValue
  className?: ClassValue
}

interface RuntimeCvaConfig {
  variants?: Record<string, Record<string, ClassValue>>
  defaultVariants?: Record<string, unknown>
  compoundVariants?: RuntimeCvaProps[]
}

interface CompiledCompoundVariant {
  selectorKeys: string[]
  selectorValues: unknown[]
  selectorArrays: (unknown[] | null)[]
  classNameFragment: string
}

interface CompiledCombinationTable {
  slotCount: number
  statesByKey: Record<string, number>[]
  stateCounts: number[]
  defaultStates: number[]
}

interface CompiledCvaConfig {
  baseFragment: string
  variantNames: string[]
  variantClassNamesByKey: Record<string, string | undefined>[]
  variantDefinitions: Record<string, ClassValue>[]
  defaultVariantKeys: unknown[]
  compiledCompoundVariants: CompiledCompoundVariant[]
  compoundDefaultValues: Record<string, unknown>
  memoPropNames: string[]
  defaultClassName: string | null
  memoLane: number
  memoPropName0: string
  memoPropName1: string
  memoValueCountPerRow: number
  memoCandidateValues: unknown[]
  memoizedValues: unknown[]
  memoizedResults: string[]
  memoRingRowCount: number
  memoWrittenRowCount: number
  memoScanRowCount: number
  nextMemoRowIndex: number
  didMemoHitThisPass: boolean
  combinationSlotCount: number
  combinationStatesByKey: Record<string, number>[]
  combinationStateCounts: number[]
  combinationDefaultStates: number[]
  combinationClassNames: (string | null)[]
}

const normalizeVariantKey = (value: unknown): unknown =>
  typeof value === "boolean"
    ? value
      ? "true"
      : "false"
    : value === 0
      ? "0"
      : value

const compileCompoundVariant = (
  compoundVariant: RuntimeCvaProps
): CompiledCompoundVariant => {
  const selectorKeys: string[] = []
  const selectorValues: unknown[] = []
  const selectorArrays: (unknown[] | null)[] = []
  for (const selectorKey of Object.keys(compoundVariant)) {
    if (selectorKey === "class" || selectorKey === "className") continue
    const selectorValue = compoundVariant[selectorKey]
    selectorKeys.push(selectorKey)
    selectorValues.push(selectorValue)
    selectorArrays.push(Array.isArray(selectorValue) ? selectorValue : null)
  }
  const classFragment = resolveClassValue(compoundVariant.class)
  const classNameFragment = resolveClassValue(compoundVariant.className)
  const combinedClassNameFragment =
    classFragment && classNameFragment
      ? classFragment + " " + classNameFragment
      : classFragment || classNameFragment
  return {
    selectorKeys,
    selectorValues,
    selectorArrays,
    classNameFragment: combinedClassNameFragment,
  }
}

const compileCombinationTable = (
  variantNames: string[],
  variantClassNamesByKey: Record<string, string | undefined>[],
  defaultVariantKeys: unknown[]
): CompiledCombinationTable | null => {
  const variantStatesByKey: Record<string, number>[] = []
  const variantStateCounts: number[] = []
  const defaultVariantStates: number[] = []
  let combinationSlotCount = 1
  for (
    let variantIndex = 0;
    variantIndex < variantNames.length;
    variantIndex++
  ) {
    const defaultVariantKey = defaultVariantKeys[variantIndex]
    if (
      defaultVariantKey !== null &&
      (typeof defaultVariantKey === "object" ||
        typeof defaultVariantKey === "symbol" ||
        typeof defaultVariantKey === "function")
    ) {
      return null
    }
    const stateByKey: Record<string, number> = Object.create(null)
    let stateCount = 1
    for (const valueKey of Object.keys(variantClassNamesByKey[variantIndex]!)) {
      stateByKey[valueKey] = stateCount++
    }
    const defaultVariantKeyString = String(defaultVariantKey)
    if (stateByKey[defaultVariantKeyString] === undefined) {
      stateByKey[defaultVariantKeyString] = stateCount++
    }
    variantStatesByKey.push(stateByKey)
    variantStateCounts.push(stateCount)
    defaultVariantStates.push(stateByKey[defaultVariantKeyString]!)
    combinationSlotCount *= stateCount
    if (combinationSlotCount > CVA_TABLE_MAX_SLOTS) return null
  }
  return {
    slotCount: combinationSlotCount,
    statesByKey: variantStatesByKey,
    stateCounts: variantStateCounts,
    defaultStates: defaultVariantStates,
  }
}

const compileCvaConfig = (
  base: ClassValue,
  config: RuntimeCvaConfig | null | undefined
): CompiledCvaConfig => {
  const baseFragment = resolveClassValue(base)
  const variants = config?.variants
  const variantNames = variants == null ? [] : Object.keys(variants)
  const variantClassNamesByKey: Record<string, string | undefined>[] = []
  const variantDefinitions: Record<string, ClassValue>[] = []
  const defaultVariantKeys: unknown[] = []
  const defaultVariants = config?.defaultVariants
  for (const variantName of variantNames) {
    const variantDefinition = variants![variantName]!
    const classNamesByKey: Record<string, string | undefined> =
      Object.create(null)
    for (const valueKey of Object.keys(variantDefinition)) {
      classNamesByKey[valueKey] = resolveClassValue(variantDefinition[valueKey])
    }
    variantClassNamesByKey.push(classNamesByKey)
    variantDefinitions.push(variantDefinition)
    defaultVariantKeys.push(normalizeVariantKey(defaultVariants?.[variantName]))
  }

  const compiledCompoundVariants: CompiledCompoundVariant[] = []
  if (variants != null && config?.compoundVariants) {
    for (const compoundVariant of config.compoundVariants) {
      compiledCompoundVariants.push(compileCompoundVariant(compoundVariant))
    }
  }

  const compoundDefaultValues: Record<string, unknown> = { ...defaultVariants }

  const memoPropNames: string[] = []
  const seenMemoPropNames: Record<string, boolean> = Object.create(null)
  for (const variantName of variantNames) {
    seenMemoPropNames[variantName] = true
    memoPropNames.push(variantName)
  }
  for (const compiledCompoundVariant of compiledCompoundVariants) {
    for (const selectorKey of compiledCompoundVariant.selectorKeys) {
      if (seenMemoPropNames[selectorKey]) continue
      seenMemoPropNames[selectorKey] = true
      memoPropNames.push(selectorKey)
    }
  }

  const memoPropCount = memoPropNames.length
  const naturalMemoValueCountPerRow = memoPropCount + 2
  const isMemoizable =
    naturalMemoValueCountPerRow <= CVA_MEMO_VALUE_SLOTS_PER_ROW
  const isFastLane =
    isMemoizable && memoPropCount <= CVA_MEMO_FAST_LANE_MAX_PROP_NAMES
  const memoValueCountPerRow = isFastLane
    ? CVA_MEMO_FAST_LANE_SLOTS_PER_ROW
    : naturalMemoValueCountPerRow
  const combinationTable =
    compiledCompoundVariants.length === 0 && isMemoizable
      ? compileCombinationTable(
          variantNames,
          variantClassNamesByKey,
          defaultVariantKeys
        )
      : null

  return {
    baseFragment,
    variantNames,
    variantClassNamesByKey,
    variantDefinitions,
    defaultVariantKeys,
    compiledCompoundVariants,
    compoundDefaultValues,
    memoPropNames,
    defaultClassName: null,
    memoLane: isFastLane
      ? CVA_MEMO_LANE_FAST
      : isMemoizable
        ? CVA_MEMO_LANE_WIDE
        : CVA_MEMO_LANE_NONE,
    memoPropName0: memoPropNames[0] ?? "class",
    memoPropName1: memoPropNames[1] ?? memoPropNames[0] ?? "class",
    memoValueCountPerRow: isMemoizable ? memoValueCountPerRow : 0,
    memoCandidateValues: isMemoizable
      ? createFilledArray<unknown>(memoValueCountPerRow, undefined)
      : [],
    memoizedValues: isMemoizable
      ? createFilledArray<unknown>(
          CVA_MEMO_ROW_COUNT * memoValueCountPerRow,
          undefined
        )
      : [],
    memoizedResults: isMemoizable
      ? createFilledArray(CVA_MEMO_ROW_COUNT, "")
      : [],
    memoRingRowCount: CVA_MEMO_ROW_COUNT,
    memoWrittenRowCount: 0,
    memoScanRowCount: 0,
    nextMemoRowIndex: 0,
    didMemoHitThisPass: true,
    combinationSlotCount:
      combinationTable === null ? 0 : combinationTable.slotCount,
    combinationStatesByKey:
      combinationTable === null ? [] : combinationTable.statesByKey,
    combinationStateCounts:
      combinationTable === null ? [] : combinationTable.stateCounts,
    combinationDefaultStates:
      combinationTable === null ? [] : combinationTable.defaultStates,
    combinationClassNames:
      combinationTable === null
        ? []
        : createFilledArray<string | null>(combinationTable.slotCount, null),
  }
}

const hasOwnPropertyCheck = Object.prototype.hasOwnProperty

const resolveVariantClassName = (
  compiledConfig: CompiledCvaConfig,
  props: RuntimeCvaProps | undefined
): string => {
  let className = compiledConfig.baseFragment

  const variantNames = compiledConfig.variantNames
  for (
    let variantIndex = 0;
    variantIndex < variantNames.length;
    variantIndex++
  ) {
    const propValue =
      props === undefined ? undefined : props[variantNames[variantIndex]!]
    if (propValue === null) continue
    const normalizedVariantKey = normalizeVariantKey(propValue)
    const variantKey =
      normalizedVariantKey || compiledConfig.defaultVariantKeys[variantIndex]
    let variantClassName =
      compiledConfig.variantClassNamesByKey[variantIndex]![variantKey as string]
    if (variantClassName === undefined) {
      variantClassName = resolveClassValue(
        compiledConfig.variantDefinitions[variantIndex]![variantKey as string]
      )
    }
    if (variantClassName) {
      if (className) className += " "
      className += variantClassName
    }
  }

  const compiledCompoundVariants = compiledConfig.compiledCompoundVariants
  for (
    let compoundIndex = 0;
    compoundIndex < compiledCompoundVariants.length;
    compoundIndex++
  ) {
    const compiledCompoundVariant = compiledCompoundVariants[compoundIndex]!
    const selectorKeys = compiledCompoundVariant.selectorKeys
    let doesCompoundVariantMatch = true
    for (
      let selectorIndex = 0;
      selectorIndex < selectorKeys.length;
      selectorIndex++
    ) {
      const selectorKey = selectorKeys[selectorIndex]!
      const selectedValue =
        props !== undefined &&
        hasOwnPropertyCheck.call(props, selectorKey) &&
        props[selectorKey] !== undefined
          ? props[selectorKey]
          : compiledConfig.compoundDefaultValues[selectorKey]
      const selectorArray =
        compiledCompoundVariant.selectorArrays[selectorIndex]
      const doesSelectorMatch =
        selectorArray !== null
          ? selectorArray.includes(selectedValue)
          : selectedValue ===
            compiledCompoundVariant.selectorValues[selectorIndex]
      if (!doesSelectorMatch) {
        doesCompoundVariantMatch = false
        break
      }
    }
    if (doesCompoundVariantMatch && compiledCompoundVariant.classNameFragment) {
      if (className) className += " "
      className += compiledCompoundVariant.classNameFragment
    }
  }

  if (props !== undefined) {
    const additionalClass = resolveClassValue(props.class)
    if (additionalClass) {
      if (className) className += " "
      className += additionalClass
    }
    const additionalClassName = resolveClassValue(props.className)
    if (additionalClassName) {
      if (className) className += " "
      className += additionalClassName
    }
  }

  return className
}

const resolveMemoMiss = (
  compiledConfig: CompiledCvaConfig,
  propRecord: RuntimeCvaProps
): string => {
  const memoValueCountPerRow = compiledConfig.memoValueCountPerRow
  const memoCandidateValues = compiledConfig.memoCandidateValues
  const resolvedClassName = resolveVariantClassName(compiledConfig, propRecord)
  let memoValueIndex = 0
  for (; memoValueIndex < memoValueCountPerRow; memoValueIndex++) {
    const memoValue = memoCandidateValues[memoValueIndex]
    if (
      memoValue !== null &&
      (typeof memoValue === "object" || typeof memoValue === "function")
    ) {
      break
    }
  }
  if (memoValueIndex === memoValueCountPerRow) {
    const memoizedValues = compiledConfig.memoizedValues
    const memoRowIndex = compiledConfig.nextMemoRowIndex
    const rowStartIndex = memoRowIndex * memoValueCountPerRow
    for (
      memoValueIndex = 0;
      memoValueIndex < memoValueCountPerRow;
      memoValueIndex++
    ) {
      memoizedValues[rowStartIndex + memoValueIndex] =
        memoCandidateValues[memoValueIndex]
    }
    compiledConfig.memoizedResults[memoRowIndex] = resolvedClassName
    let followingMemoRowIndex = memoRowIndex + 1
    if (memoRowIndex === compiledConfig.memoWrittenRowCount) {
      compiledConfig.memoWrittenRowCount = followingMemoRowIndex
      compiledConfig.memoScanRowCount = followingMemoRowIndex
    }
    if (followingMemoRowIndex === compiledConfig.memoRingRowCount) {
      const memoRingRowCount = compiledConfig.didMemoHitThisPass
        ? CVA_MEMO_ROW_COUNT
        : CVA_MEMO_NARROW_ROW_COUNT
      const memoWrittenRowCount = compiledConfig.memoWrittenRowCount
      compiledConfig.memoRingRowCount = memoRingRowCount
      compiledConfig.memoScanRowCount =
        memoWrittenRowCount < memoRingRowCount
          ? memoWrittenRowCount
          : memoRingRowCount
      compiledConfig.didMemoHitThisPass = false
      followingMemoRowIndex = 0
    }
    compiledConfig.nextMemoRowIndex = followingMemoRowIndex
  }
  return resolvedClassName
}

const resolveThroughFastMemo = (
  compiledConfig: CompiledCvaConfig,
  propRecord: RuntimeCvaProps
): string => {
  const firstMemoValue = propRecord[compiledConfig.memoPropName0]
  const secondMemoValue = propRecord[compiledConfig.memoPropName1]
  const additionalClass = propRecord.class
  const additionalClassName = propRecord.className
  const memoizedValues = compiledConfig.memoizedValues
  const memoScanRowCount = compiledConfig.memoScanRowCount
  for (let rowIndex = 0; rowIndex < memoScanRowCount; rowIndex++) {
    const rowStartIndex = rowIndex * CVA_MEMO_FAST_LANE_SLOTS_PER_ROW
    if (
      firstMemoValue === memoizedValues[rowStartIndex] &&
      secondMemoValue === memoizedValues[rowStartIndex + 1] &&
      additionalClass === memoizedValues[rowStartIndex + 2] &&
      additionalClassName === memoizedValues[rowStartIndex + 3]
    ) {
      compiledConfig.didMemoHitThisPass = true
      return compiledConfig.memoizedResults[rowIndex]!
    }
  }
  const memoCandidateValues = compiledConfig.memoCandidateValues
  memoCandidateValues[0] = firstMemoValue
  memoCandidateValues[1] = secondMemoValue
  memoCandidateValues[2] = additionalClass
  memoCandidateValues[3] = additionalClassName
  return resolveMemoMiss(compiledConfig, propRecord)
}

const resolveThroughWideMemo = (
  compiledConfig: CompiledCvaConfig,
  propRecord: RuntimeCvaProps
): string => {
  const memoValueCountPerRow = compiledConfig.memoValueCountPerRow
  const memoPropNames = compiledConfig.memoPropNames
  const memoPropCount = memoPropNames.length
  const memoCandidateValues = compiledConfig.memoCandidateValues
  for (let memoPropIndex = 0; memoPropIndex < memoPropCount; memoPropIndex++) {
    memoCandidateValues[memoPropIndex] =
      propRecord[memoPropNames[memoPropIndex]!]
  }
  memoCandidateValues[memoPropCount] = propRecord.class
  memoCandidateValues[memoPropCount + 1] = propRecord.className

  const memoizedValues = compiledConfig.memoizedValues
  const memoScanRowCount = compiledConfig.memoScanRowCount
  for (let rowIndex = 0; rowIndex < memoScanRowCount; rowIndex++) {
    const rowStartIndex = rowIndex * memoValueCountPerRow
    let memoValueIndex = 0
    while (
      memoValueIndex < memoValueCountPerRow &&
      memoCandidateValues[memoValueIndex] ===
        memoizedValues[rowStartIndex + memoValueIndex]
    ) {
      memoValueIndex++
    }
    if (memoValueIndex === memoValueCountPerRow) {
      compiledConfig.didMemoHitThisPass = true
      return compiledConfig.memoizedResults[rowIndex]!
    }
  }

  return resolveMemoMiss(compiledConfig, propRecord)
}

const resolveThroughMemo = (
  compiledConfig: CompiledCvaConfig,
  propRecord: RuntimeCvaProps
): string =>
  compiledConfig.memoLane === CVA_MEMO_LANE_FAST
    ? resolveThroughFastMemo(compiledConfig, propRecord)
    : resolveThroughWideMemo(compiledConfig, propRecord)

const resolveThroughCombinationTable = (
  compiledConfig: CompiledCvaConfig,
  propRecord: RuntimeCvaProps
): string => {
  const additionalClass = propRecord.class
  const additionalClassName = propRecord.className
  if (additionalClass !== undefined || additionalClassName !== undefined) {
    if (
      (typeof additionalClass === "object" && additionalClass !== null) ||
      (typeof additionalClassName === "object" && additionalClassName !== null)
    ) {
      return resolveVariantClassName(compiledConfig, propRecord)
    }
    return resolveThroughMemo(compiledConfig, propRecord)
  }

  const variantNames = compiledConfig.variantNames
  const combinationStatesByKey = compiledConfig.combinationStatesByKey
  const combinationStateCounts = compiledConfig.combinationStateCounts
  const combinationDefaultStates = compiledConfig.combinationDefaultStates
  let combinationSlotIndex = 0
  for (
    let variantIndex = 0;
    variantIndex < variantNames.length;
    variantIndex++
  ) {
    const propValue = propRecord[variantNames[variantIndex]!]
    if (
      propValue !== null &&
      (typeof propValue === "object" || typeof propValue === "function")
    ) {
      return resolveVariantClassName(compiledConfig, propRecord)
    }
    let variantState = 0
    if (propValue !== null) {
      const normalizedVariantKey = normalizeVariantKey(propValue)
      const resolvedState = normalizedVariantKey
        ? combinationStatesByKey[variantIndex]![normalizedVariantKey as string]
        : combinationDefaultStates[variantIndex]!
      if (resolvedState === undefined)
        return resolveThroughMemo(compiledConfig, propRecord)
      variantState = resolvedState
    }
    combinationSlotIndex =
      combinationSlotIndex * combinationStateCounts[variantIndex]! +
      variantState
  }
  const internedClassName =
    compiledConfig.combinationClassNames[combinationSlotIndex]!
  if (internedClassName !== null) return internedClassName
  const resolvedClassName = resolveVariantClassName(compiledConfig, propRecord)
  compiledConfig.combinationClassNames[combinationSlotIndex] = resolvedClassName
  return resolvedClassName
}

export const cva = <T>(base?: ClassValue, config?: CvaConfig<T>) => {
  let compiledConfig: CompiledCvaConfig | null = null

  return (props?: CvaProps<T>): string => {
    if (compiledConfig === null) {
      compiledConfig = compileCvaConfig(
        base,
        config as RuntimeCvaConfig | null | undefined
      )
    }
    if (props == null) {
      let defaultClassName = compiledConfig.defaultClassName
      if (defaultClassName === null) {
        defaultClassName = resolveVariantClassName(compiledConfig, undefined)
        compiledConfig.defaultClassName = defaultClassName
      }
      return defaultClassName
    }
    const propRecord = props as RuntimeCvaProps
    if (compiledConfig.combinationSlotCount !== 0) {
      return resolveThroughCombinationTable(compiledConfig, propRecord)
    }
    const memoLane = compiledConfig.memoLane
    if (memoLane === CVA_MEMO_LANE_FAST)
      return resolveThroughFastMemo(compiledConfig, propRecord)
    if (memoLane === CVA_MEMO_LANE_WIDE)
      return resolveThroughWideMemo(compiledConfig, propRecord)
    return resolveVariantClassName(compiledConfig, propRecord)
  }
}
