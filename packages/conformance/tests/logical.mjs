// Shorthand and axis utilities must override the logical sides they cover.
import assert from "node:assert/strict"
import { cn } from "cn"
import { compileToTables, subsetConfig } from "cn/compiler"
import { createCn, defaultConfig } from "cn/config"
import { createCn as createCompiledCn } from "cn/engine"

import { ref } from "./reference.mjs"

// Each family lists one token per role. `inline` and `block` hold the logical
// sides, `left` and `top` hold one physical side of each axis.
const families = [
  {
    name: "padding",
    all: "p-2",
    x: "px-2",
    y: "py-2",
    inline: ["ps-11", "pe-11"],
    block: ["pbs-11", "pbe-11"],
    left: "pl-11",
    top: "pt-11",
  },
  {
    name: "margin",
    all: "m-2",
    x: "mx-2",
    y: "my-2",
    inline: ["ms-11", "me-11", "-ms-11"],
    block: ["mbs-11", "mbe-11", "-mbe-11"],
    left: "ml-11",
    top: "mt-11",
  },
  {
    name: "inset",
    all: "inset-0",
    x: "inset-x-0",
    y: "inset-y-0",
    inline: ["start-4", "end-4", "inset-s-4", "inset-e-4", "-start-4"],
    block: ["inset-bs-4", "inset-be-4", "-inset-be-4"],
    left: "left-4",
    top: "top-4",
  },
  {
    name: "border width",
    all: "border-2",
    x: "border-x-2",
    y: "border-y-2",
    inline: ["border-s-4", "border-e-4", "border-s", "border-e"],
    block: ["border-bs-4", "border-be-4", "border-bs", "border-be"],
    left: "border-l-4",
    top: "border-t-4",
  },
  {
    name: "border color",
    all: "border-red-500",
    x: "border-x-red-500",
    y: "border-y-red-500",
    inline: ["border-s-blue-500", "border-e-blue-500"],
    block: ["border-bs-blue-500", "border-be-blue-500"],
    left: "border-l-blue-500",
    top: "border-t-blue-500",
  },
  {
    name: "scroll margin",
    all: "scroll-m-2",
    x: "scroll-mx-2",
    y: "scroll-my-2",
    inline: ["scroll-ms-11", "scroll-me-11"],
    block: ["scroll-mbs-11", "scroll-mbe-11"],
    left: "scroll-ml-11",
    top: "scroll-mt-11",
  },
  {
    name: "scroll padding",
    all: "scroll-p-2",
    x: "scroll-px-2",
    y: "scroll-py-2",
    inline: ["scroll-ps-11", "scroll-pe-11"],
    block: ["scroll-pbs-11", "scroll-pbe-11"],
    left: "scroll-pl-11",
    top: "scroll-pt-11",
  },
]

const merges = []

function replace(first, last) {
  merges.push([`${first} ${last}`, last])
}

function coexist(first, last) {
  merges.push([`${first} ${last}`, `${first} ${last}`])
  merges.push([`${last} ${first}`, `${last} ${first}`])
}

// A side set after the shorthand refines it, so only this order is kept.
function refine(shorthand, side) {
  merges.push([`${shorthand} ${side}`, `${shorthand} ${side}`])
}

function decorated(first, last, check) {
  check(first, last)
  check(`hover:${first}`, `hover:${last}`)
  check(`rtl:md:${first}`, `rtl:md:${last}`)
  check(`${first}!`, `${last}!`)
}

for (const family of families) {
  for (const side of family.inline) {
    decorated(side, family.all, replace)
    decorated(side, family.x, replace)
    refine(family.all, side)
    refine(family.x, side)
    coexist(side, family.y)
    coexist(side, family.left)
    coexist(side, `hover:${family.x}`)
    coexist(side, `${family.x}!`)
  }
  for (const side of family.block) {
    decorated(side, family.all, replace)
    decorated(side, family.y, replace)
    refine(family.all, side)
    refine(family.y, side)
    coexist(side, family.x)
    coexist(side, family.top)
    coexist(side, `hover:${family.y}`)
    coexist(side, `${family.y}!`)
  }
  for (const first of family.inline) {
    for (const last of family.block) {
      coexist(first, last)
    }
  }
  const [start, end] = family.inline
  const [blockStart, blockEnd] = family.block
  coexist(start, end)
  coexist(blockStart, blockEnd)
  merges.push([
    `${start} ${end} ${blockStart} ${blockEnd} ${family.x}`,
    `${blockStart} ${blockEnd} ${family.x}`,
  ])
  merges.push([
    `${start} ${end} ${blockStart} ${blockEnd} ${family.y}`,
    `${start} ${end} ${family.y}`,
  ])
  merges.push([
    `${start} ${end} ${blockStart} ${blockEnd} ${family.all}`,
    family.all,
  ])
}

// `start` and `inset-s` are two names for one property.
replace("start-4", "inset-s-2")
replace("inset-e-4", "end-2")

// Logical corners: a side covers its two corners, `rounded` covers all.
const corners = {
  "rounded-s-md": ["rounded-ss-lg", "rounded-es-lg"],
  "rounded-e-md": ["rounded-se-lg", "rounded-ee-lg"],
}
for (const [side, own] of Object.entries(corners)) {
  decorated(side, "rounded-md", replace)
  for (const corner of own) {
    decorated(corner, side, replace)
    decorated(corner, "rounded-md", replace)
    refine(side, corner)
  }
}
coexist("rounded-s-md", "rounded-e-md")
coexist("rounded-ss-lg", "rounded-e-md")
coexist("rounded-se-lg", "rounded-s-md")
coexist("rounded-ss-lg", "rounded-es-lg")
coexist("rounded-s-md", "rounded-l-md")
coexist("rounded-ss-lg", "rounded-tl-lg")

// Logical sizes follow upstream: they only replace themselves.
for (const [first, last] of [
  ["inline-4", "inline-full"],
  ["min-inline-4", "min-inline-full"],
  ["max-inline-4", "max-inline-full"],
  ["block-4", "block-full"],
  ["min-block-4", "min-block-full"],
  ["max-block-4", "max-block-full"],
]) {
  decorated(first, last, replace)
}
coexist("inline-4", "block-4")
coexist("inline-4", "w-4")
coexist("block-4", "h-4")
coexist("inline-4", "size-4")
coexist("block-4", "size-4")

const config = defaultConfig()
const compiled = compileToTables(config)
const subset = compileToTables(
  subsetConfig(
    config,
    merges.flatMap(([input]) => input.split(" "))
  ).config
)
const engines = [
  ["reference", ref],
  ["default", cn],
  ["runtime config", createCn()],
  ["compiled", createCompiledCn(compiled.tables, compiled.validatorImpls)],
  ["subset", createCompiledCn(subset.tables, subset.validatorImpls)],
]
const failures = []
const counts = []
for (const [name, merge] of engines) {
  const before = failures.length
  for (const [input, expected] of merges) {
    const actual = merge(input)
    if (actual !== expected) {
      failures.push(`${name}: ${input} -> ${actual} (expected ${expected})`)
    }
  }
  counts.push(`${name} ${failures.length - before}`)
}
assert.equal(
  failures.length,
  0,
  `${failures.length} of ${merges.length * engines.length} logical merges failed (${counts.join(", ")})\n${failures.slice(0, 20).join("\n")}`
)

console.log(`logical: ${merges.length * engines.length} merges passed`)
