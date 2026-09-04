import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import {
  cva as referenceCva,
  cx as referenceCx,
} from "class-variance-authority"
import { cva, cx } from "cn"
import { cva as subpathCva } from "cn/cva"

const sites = JSON.parse(
  readFileSync(new URL("../bench/cva/cva-sites.json", import.meta.url), "utf8")
)
const calls = JSON.parse(
  readFileSync(new URL("../bench/cva/cva-calls.json", import.meta.url), "utf8")
)

let checked = 0
const same = (actual, expected, label) => {
  checked++
  assert.equal(actual, expected, label)
}

same(cx("a", ["b", { c: true }]), referenceCx("a", ["b", { c: true }]), "cx")
same(
  subpathCva("a", { variants: { tone: { calm: "b" } } })({ tone: "calm" }),
  "a b",
  "cva subpath"
)

const ours = sites.map(({ base, config }) => cva(base, config ?? undefined))
const theirs = sites.map(({ base, config }) =>
  referenceCva(base, config ?? undefined)
)

let seed = 0xc4abe4c
const random = () => {
  seed ^= seed << 13
  seed >>>= 0
  seed ^= seed >> 17
  seed ^= seed << 5
  seed >>>= 0
  return seed / 0x100000000
}
const shuffledIndices = (length) => {
  const indices = Array.from({ length }, (_, index) => index)
  for (let index = length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const value = indices[index]
    indices[index] = indices[other]
    indices[other] = value
  }
  return indices
}

const verifyRow = (row, label) => {
  const props = row.length === 2 ? row[1] : undefined
  same(ours[row[0]](props), theirs[row[0]](props), label)
}

for (let pass = 0; pass < 2; pass++) {
  for (let index = 0; index < calls.length; index++) {
    verifyRow(calls[index], `dataset fixed pass ${pass} call ${index}`)
  }
}
for (let pass = 0; pass < 3; pass++) {
  const order = shuffledIndices(calls.length)
  for (const index of order) {
    verifyRow(calls[index], `dataset shuffled pass ${pass} call ${index}`)
  }
}

const buttonConfig = {
  variants: {
    intent: {
      primary: "bg-blue-600 text-white",
      secondary: "bg-white text-gray-900",
      danger: "bg-red-600 text-white",
    },
    size: { small: "px-2 py-1", medium: "px-3 py-2", large: "px-4 py-3" },
    disabled: {
      true: "cursor-not-allowed opacity-50",
      false: "cursor-pointer",
    },
  },
  compoundVariants: [
    { intent: "primary", size: "large", class: "uppercase" },
    { intent: ["danger", "secondary"], disabled: false, className: "shadow" },
    { disabled: true, class: "select-none" },
  ],
  defaultVariants: { intent: "primary", size: "medium", disabled: false },
}
const memoOurs = cva("button rounded", buttonConfig)
const memoTheirs = referenceCva("button rounded", buttonConfig)
const intents = ["primary", "secondary", "danger", null, undefined]
const sizes = ["small", "medium", "large", null, undefined]
const disabledValues = [true, false, null, undefined]
for (let pass = 0; pass < 4; pass++) {
  let combination = 0
  for (const intent of intents) {
    for (const size of sizes) {
      for (const disabled of disabledValues) {
        const props = {
          intent,
          size,
          disabled,
          className:
            combination++ % 3 === 0 ? `adhoc-${combination}` : undefined,
        }
        same(
          memoOurs(props),
          memoTheirs(props),
          `memo combination ${combination}`
        )
      }
    }
  }
}

const mutableClass = { underline: true }
const mutableProps = { intent: "secondary", className: mutableClass }
same(memoOurs(mutableProps), memoTheirs(mutableProps), "mutable class before")
mutableClass.underline = false
same(memoOurs(mutableProps), memoTheirs(mutableProps), "mutable class after")

const wideVariants = {}
for (let index = 0; index < 20; index++) {
  wideVariants[`variant${index}`] = {
    on: `variant-${index}-on`,
    off: `variant-${index}-off`,
  }
}
const wideOurs = cva("wide", { variants: wideVariants })
const wideTheirs = referenceCva("wide", { variants: wideVariants })
for (let pass = 0; pass < 40; pass++) {
  const props = {
    variant0: pass % 2 ? "on" : "off",
    variant7: pass % 3 ? "off" : "on",
    variant19: "on",
  }
  same(wideOurs(props), wideTheirs(props), `wide config ${pass}`)
}

console.log(`cva: pass ${checked}  fail 0`)
