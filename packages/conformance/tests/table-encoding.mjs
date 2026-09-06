import assert from "node:assert/strict"
import { compileToSource, compileToTables, subsetConfig } from "cn/compiler"
import { defaultConfig } from "cn/config"
import { transform } from "esbuild"

const empty = {
  theme: {},
  classGroups: {},
  conflictingClassGroups: {},
  conflictingClassGroupModifiers: {},
  orderSensitiveModifiers: [],
}

const configs = {
  default: defaultConfig(),
  subset: subsetConfig(defaultConfig(), [
    "break-after-auto",
    "break-after-avoid-page",
    "contain-layout",
    "contain-none",
    "bg-gradient-to-r",
    "animate-in",
  ]).config,
  empty,
  emptyTail: { ...empty, classGroups: { empty: [{ "": [""] }] } },
  literals: {
    ...empty,
    classGroups: {
      singleton: ["standalone"],
      shared: ["utility-right", "utility-left", "utility-center"],
      unrelated: ["zebra", "apple", "middle"],
      emptySuffix: ["prefix", "prefix-more"],
      duplicates: ["same", "same"],
      unicode: ["shape-😀", "shape-😁", "shape-é"],
      escaped: ['quote-"a', 'quote-"b', "slash-\\a", "slash-\\b"],
    },
  },
}

for (const [name, config] of Object.entries(configs)) {
  const expected = compileToTables(config).tables
  for (const lang of ["js", "ts"]) {
    let source = compileToSource(config, { lang })
    if (lang === "ts") {
      source = (await transform(source, { loader: "ts", format: "esm" })).code
    }
    const { default: actual } = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    )
    assert.deepEqual(actual, expected, `${name}: emitted ${lang} tables`)
  }
}

console.log("table-encoding: emitted JS and TS tables match in-memory tables")
