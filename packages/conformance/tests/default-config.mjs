// Explicit grammar regressions, including additions beyond the upstream config.
import assert from "node:assert/strict"
import { cn } from "cn"
import { compileToTables, subsetConfig } from "cn/compiler"
import { createCn, defaultConfig } from "cn/config"
import { createCn as createCompiledCn } from "cn/engine"
import { getDefaultConfig } from "tailwind-merge"

import { ref } from "./reference.mjs"

const config = defaultConfig()
const upstreamGroups = getDefaultConfig().classGroups
for (const id of Object.keys(upstreamGroups)) {
  assert.ok(id in config.classGroups, `preserve upstream group ${id}`)
}
assert.deepEqual(
  Object.keys(config.classGroups)
    .filter((id) => !(id in upstreamGroups))
    .sort(),
  [
    "contain",
    "contain-layout",
    "contain-paint",
    "contain-size",
    "contain-style",
  ]
)
const classifications = []
const merges = []

function group(id, tokens) {
  for (const token of tokens) classifications.push([token, [id]])
}

function replace(first, last) {
  merges.push([`${first} ${last}`, last])
}

function coexist(first, last) {
  merges.push([`${first} ${last}`, `${first} ${last}`])
  merges.push([`${last} ${first}`, `${last} ${first}`])
}

// Theme animation names are open-ended, including names supplied by plugins.
const animations = [
  "animate-spin",
  "animate-ping",
  "animate-pulse",
  "animate-bounce",
  "animate-none",
  "animate-in",
  "animate-out",
  "animate-wiggle",
  "animate-accordion-down",
  "animate-[wiggle_1s_ease-in-out_infinite]",
  "animate-(--animation)",
]
group("animate", animations)
for (const token of animations) {
  replace("animate-spin", token)
  replace(token, "animate-in")
}
group("animate", ["motion-safe:animate-in", "hover:animate-out!"])
replace("motion-safe:animate-spin", "motion-safe:animate-in")
replace("!animate-spin", "animate-out!")
coexist("animate-spin", "hover:animate-in")
coexist("animate-spin", "animate-in!")

const containment = [
  "contain-none",
  "contain-content",
  "contain-strict",
  "contain-[layout_paint]",
  "contain-(--containment)",
]
group("contain", containment)
for (const token of containment) {
  replace("contain-none", token)
  replace(token, "contain-strict")
}
group("contain-size", ["contain-size", "contain-inline-size"])
group("contain-layout", ["contain-layout", "@min-sm:@max-lg:contain-layout!"])
group("contain-paint", ["contain-paint", "hover:contain-paint"])
group("contain-style", ["contain-style"])
const containmentParts = [
  "contain-size",
  "contain-layout",
  "contain-paint",
  "contain-style",
]
for (const token of [...containmentParts, "contain-inline-size"]) {
  replace(token, token)
  for (const reset of containment) {
    replace(reset, token)
    replace(token, reset)
    replace(`hover:${reset}`, `hover:${token}`)
    replace(`hover:${token}`, `hover:${reset}`)
    replace(`${reset}!`, `${token}!`)
    replace(`${token}!`, `${reset}!`)
  }
}
replace("contain-size", "contain-inline-size")
replace("contain-inline-size", "contain-size")
const composedContainment = containmentParts.join(" ")
for (const reset of containment) {
  replace(composedContainment, reset)
  merges.push([`${reset} ${composedContainment}`, composedContainment])
}
merges.push([composedContainment, composedContainment])
merges.push([
  "contain-size contain-none contain-layout",
  "contain-size contain-layout",
])
coexist("contain-layout", "contain-paint")
coexist("contain-inline-size", "contain-style")
replace("hover:contain-paint", "hover:contain-content")
replace("!contain-size", "contain-inline-size!")
replace("!contain-none", "contain-paint!")
replace("@min-sm:@max-lg:contain-layout!", "@min-sm:@max-lg:contain-content!")
replace("@min-sm:@max-lg:contain-content!", "@min-sm:@max-lg:contain-layout!")
coexist("contain-size", "hover:contain-paint")
coexist("contain-size", "contain-paint!")
coexist("contain-none", "hover:contain-paint")
coexist("contain-none", "contain-paint!")
coexist("contain-layout", "container")

// Legacy gradient directions share the background-image group with v4 names.
for (const direction of ["t", "tr", "r", "br", "b", "bl", "l", "tl"]) {
  const token = `bg-gradient-to-${direction}`
  group("bg-image", [token])
  replace("bg-gradient-to-t", token)
  replace(token, "bg-linear-to-r")
  replace("bg-linear-to-r", token)
  replace(token, "bg-none")
  coexist(token, "bg-red-500")
}
group("bg-image", ["hover:bg-gradient-to-r", "bg-gradient-to-l!"])
replace("hover:bg-gradient-to-t", "hover:bg-gradient-to-r")
replace("!bg-gradient-to-t", "bg-linear-to-r!")
replace("bg-gradient-to-r", "bg-[url(/gradient.svg)]")
replace("bg-radial", "bg-gradient-to-r")
coexist("hover:bg-gradient-to-r", "hover:bg-red-500")
coexist("bg-gradient-to-r!", "bg-red-500!")
coexist("bg-gradient-to-r", "from-red-500")

// The audited v4 families must retain their specific groups over broad fallbacks.
const supported = [
  ["text-shadow", "text-shadow-sm", "text-shadow-lg"],
  ["text-shadow", "text-shadow-none", "text-shadow-[0_1px_2px_black]"],
  [
    "text-shadow-color",
    "text-shadow-red-500",
    "text-shadow-(color:--shadow-color)",
  ],
  ["inset-shadow", "inset-shadow-sm", "inset-shadow-xs"],
  ["inset-shadow", "inset-shadow-none", "inset-shadow-[0_1px_2px_black]"],
  ["inset-shadow-color", "inset-shadow-red-500", "inset-shadow-blue-500"],
  ["wrap", "wrap-break-word", "wrap-anywhere"],
  ["wrap", "wrap-anywhere", "wrap-normal"],
  ["field-sizing", "field-sizing-content", "field-sizing-fixed"],
  ["columns", "columns-3", "columns-auto"],
  ["bg-image", "bg-linear-to-r", "bg-conic"],
  ["max-h", "max-h-8", "max-h-none"],
  ["inline-size", "inline-8", "inline-xs"],
  ["min-inline-size", "min-inline-8", "min-inline-xs"],
  ["max-inline-size", "max-inline-8", "max-inline-xs"],
  ["auto-cols", "auto-cols-fr", "auto-cols-16"],
  ["auto-rows", "auto-rows-fr", "auto-rows-12"],
  ["shadow", "shadow-sm", "shadow-inner"],
  ["mask-clip", "mask-clip-border", "mask-no-clip"],
  ["mask-composite", "mask-add", "mask-intersect"],
  ["mask-image-linear-pos", "mask-linear-45", "mask-linear-90"],
  ["mask-image-radial", "mask-radial-[50%_50%]", "mask-radial-(--mask)"],
  ["mask-image-radial-shape", "mask-radial-circle", "mask-radial-ellipse"],
  [
    "mask-image-radial-size",
    "mask-radial-closest-side",
    "mask-radial-farthest-corner",
  ],
  ["mask-image-radial-pos", "mask-radial-at-center", "mask-radial-at-top"],
  ["mask-image-conic-pos", "mask-conic-45", "mask-conic-90"],
  ["mask-mode", "mask-alpha", "mask-luminance"],
  ["mask-origin", "mask-origin-border", "mask-origin-content"],
  ["mask-position", "mask-center", "mask-position-(--position)"],
  ["mask-repeat", "mask-repeat", "mask-no-repeat"],
  ["mask-size", "mask-cover", "mask-size-(--size)"],
  ["mask-type", "mask-type-alpha", "mask-type-luminance"],
  ["mask-image", "mask-none", "mask-[url(/mask.svg)]"],
  ["container-type", "@container", "@container-size"],
  ["container-type", "@container-size", "@container-normal"],
  ["p", "@sm:p-2", "@sm:p-4"],
  ["p", "@max-md:p-2", "@max-md:p-4"],
  ["p", "@min-sm:@max-lg:p-2", "@min-sm:@max-lg:p-4"],
  ["p", "@lg/panel:p-2", "@lg/panel:p-4"],
  ["p", "@[30rem]:p-2", "@[30rem]:p-4"],
  ["font-features", "font-features-['kern']", "font-features-['ss01']"],
  ["tab-size", "tab-4", "tab-(--tab-size)"],
  ["zoom", "zoom-100", "zoom-125"],
  ["inline-size", "inline-4", "inline-full"],
  ["min-inline-size", "min-inline-4", "min-inline-full"],
  ["max-inline-size", "max-inline-4", "max-inline-full"],
  ["block-size", "block-4", "block-lh"],
  ["min-block-size", "min-block-4", "min-block-lh"],
  ["max-block-size", "max-block-4", "max-block-lh"],
  ["inset-bs", "inset-bs-2", "inset-bs-4"],
  ["inset-be", "inset-be-2", "inset-be-4"],
  ["pbs", "pbs-2", "pbs-4"],
  ["pbe", "pbe-2", "pbe-4"],
  ["mbs", "mbs-2", "mbs-4"],
  ["mbe", "mbe-2", "mbe-4"],
  [
    "scrollbar-thumb-color",
    "scrollbar-thumb-red-500",
    "scrollbar-thumb-blue-500",
  ],
  [
    "scrollbar-track-color",
    "scrollbar-track-red-500",
    "scrollbar-track-blue-500",
  ],
  ["scrollbar-gutter", "scrollbar-gutter-auto", "scrollbar-gutter-stable"],
  ["scrollbar-w", "scrollbar-thin", "scrollbar-none"],
]
for (const direction of [
  "linear",
  "t",
  "r",
  "b",
  "l",
  "x",
  "y",
  "radial",
  "conic",
]) {
  for (const stop of ["from", "to"]) {
    supported.push(
      [
        `mask-image-${direction}-${stop}-pos`,
        `mask-${direction}-${stop}-20%`,
        `mask-${direction}-${stop}-50%`,
      ],
      [
        `mask-image-${direction}-${stop}-color`,
        `mask-${direction}-${stop}-black`,
        `mask-${direction}-${stop}-white`,
      ]
    )
    coexist(`mask-${direction}-${stop}-20%`, `mask-${direction}-${stop}-black`)
  }
}
for (const [id, first, last] of supported) {
  group(id, [first, last])
  replace(first, last)
}
coexist("text-shadow-sm", "text-shadow-red-500")
coexist("inset-shadow-sm", "inset-shadow-red-500")
coexist("inset-shadow-sm", "shadow-lg")
coexist("shadow-inner", "shadow-red-500")
coexist("bg-conic", "bg-red-500")
coexist("@sm:p-2", "@lg:p-4")
coexist("@lg/main:p-2", "@lg/sidebar:p-4")
merges.push([
  "@container/panel @container-normal",
  "@container/panel @container-normal",
])
replace("@container-normal", "@container/panel")
replace("@container", "@container/panel")
replace("@container/first", "@container/second")
classifications.push([
  "@container/panel",
  ["container-type", "container-named"],
])

for (const [token, expected] of classifications) {
  assert.deepEqual(
    Object.keys(subsetConfig(config, [token]).config.classGroups).sort(),
    [...expected].sort(),
    `classify ${token}`
  )
}

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
for (const [name, merge] of engines) {
  for (const [input, expected] of merges) {
    assert.equal(merge(input), expected, `${name}: ${input}`)
  }
}

console.log(
  `default-config: ${classifications.length} classifications, ${merges.length * engines.length} merges passed`
)
