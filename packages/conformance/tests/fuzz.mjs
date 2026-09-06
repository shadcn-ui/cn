// Grammar-based differential fuzz vs tailwind-merge, run against dist/.
// Iterations: FUZZ_ITERS env (default 100000; CI uses 300000).
import { twMerge } from "cn"

import { ref } from "./reference.mjs"

const ITERS = Number(process.env.FUZZ_ITERS ?? 100000)

let seed = 0x5eed1234
const rnd = () => {
  seed ^= seed << 13
  seed >>>= 0
  seed ^= seed >> 17
  seed ^= seed << 5
  seed >>>= 0
  return seed / 0x100000000
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

const variants = [
  "hover",
  "focus",
  "active",
  "md",
  "lg",
  "sm",
  "dark",
  "first",
  "last",
  "disabled",
  "group-hover",
  "peer-checked",
  "*",
  "**",
  "before",
  "after",
  "marker",
  "file",
  "placeholder",
  "selection",
  "max-md",
  "min-lg",
  "data-[state=open]",
  "data-[x]",
  "aria-checked",
  "aria-[label=hi]",
  "supports-[display:grid]",
  "[&>*]",
  "[&:nth-child(2)]",
  "group-hover/name",
  "peer-focus/x",
  "has-[input]",
  "not-first",
  "in-data-open",
  "starting",
  "@md",
  "@lg/main",
  "@min-sm",
  "@max-lg",
  "@[30rem]",
  "nth-3",
  "nth-last-[2n]",
]
const bases = [
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "ps",
  "pe",
  "m",
  "mx",
  "my",
  "mt",
  "w",
  "h",
  "size",
  "inset",
  "inset-x",
  "inset-y",
  "top",
  "left",
  "start",
  "gap",
  "gap-x",
  "gap-y",
  "text",
  "font",
  "leading",
  "tracking",
  "bg",
  "border",
  "border-x",
  "border-t",
  "rounded",
  "rounded-t",
  "rounded-tl",
  "shadow",
  "ring",
  "outline",
  "z",
  "opacity",
  "scale",
  "rotate",
  "translate-x",
  "duration",
  "delay",
  "ease",
  "blur",
  "brightness",
  "grid-cols",
  "col-span",
  "basis",
  "grow",
  "shrink",
  "order",
  "columns",
  "aspect",
  "object",
  "fill",
  "stroke",
  "decoration",
  "underline-offset",
  "indent",
  "scroll-m",
  "scroll-p",
  "space-x",
  "divide-y",
  "accent",
  "caret",
  "line-clamp",
  "mask-t-from",
  "text-shadow",
  "inset-shadow",
  "rotate-x",
  "perspective",
  "transform",
  "animate",
  "contain",
  "max-h",
  "inline",
  "min-inline",
  "max-inline",
  "auto-cols",
  "auto-rows",
]
const values = [
  "0",
  "1",
  "2",
  "4",
  "8",
  "12",
  "px",
  "auto",
  "full",
  "none",
  "lg",
  "sm",
  "xl",
  "2xl",
  "red-500",
  "blue-500/50",
  "gray-100",
  "[3px]",
  "[#abc]",
  "[calc(100%-1rem)]",
  "[var(--x)]",
  "(--v)",
  "(length:--l)",
  "[length:2px]",
  "[color:red]",
  "[url(a.png)]",
  "1/2",
  "3/4",
  "[10%]",
  "tight",
  "wide",
  "cover",
  "contain",
  "center",
  "bold",
  "serif",
  "[600]",
  "video",
  "in",
  "out",
  "wiggle",
  "[wiggle_1s_linear_infinite]",
  "content",
  "strict",
  "inline-size",
  "layout",
  "paint",
  "style",
  "[layout_paint]",
  "conic",
  "gradient-to-r",
  "linear-to-t",
  "inner",
  "xs",
]
const standalone = [
  "flex",
  "block",
  "grid",
  "hidden",
  "inline",
  "contents",
  "italic",
  "not-italic",
  "underline",
  "no-underline",
  "truncate",
  "antialiased",
  "sr-only",
  "isolate",
  "transform-gpu",
  "container",
  "ordinal",
  "normal-nums",
  "slashed-zero",
  "transition",
  "shadow",
  "ring",
  "border",
  "rounded",
  "outline",
  "resize",
  "snap-x",
  "snap-start",
  "grow",
  "shrink",
  "@container",
  "animate-spin",
  "animate-in",
  "animate-out",
  "contain-size",
  "contain-inline-size",
  "contain-layout",
  "contain-paint",
  "contain-style",
  "contain-none",
  "contain-content",
  "contain-strict",
  "bg-gradient-to-r",
  "bg-linear-to-t",
  "bg-conic",
  "bg-red-500",
  "columns-auto",
  "max-h-none",
  "inline-xs",
  "min-inline-xs",
  "max-inline-xs",
  "auto-cols-16",
  "auto-rows-12",
  "shadow-inner",
  "foo",
  "my-custom",
  "[color:red]",
  "[--x:1]",
  "(oops)",
  "-",
  "!",
  "x",
]

const mkToken = () => {
  const r = rnd()
  let base
  if (r < 0.25) base = pick(standalone)
  else {
    base = pick(bases) + "-" + pick(values)
    if (rnd() < 0.1) base = "-" + base
  }
  if (rnd() < 0.12) base = rnd() < 0.5 ? "!" + base : base + "!"
  if (rnd() < 0.12) base += "/" + pick(["50", "75", "7", "[0.5]", "x"])
  let prefix = ""
  const nv = rnd() < 0.55 ? 0 : rnd() < 0.8 ? 1 : rnd() < 0.9 ? 2 : 3
  for (let i = 0; i < nv; i++) prefix += pick(variants) + ":"
  return prefix + base
}

let fail = 0
for (let i = 0; i < ITERS; i++) {
  const len = 1 + Math.floor(rnd() * 9)
  const parts = []
  for (let k = 0; k < len; k++) parts.push(mkToken())
  // occasionally messy whitespace
  const sep =
    rnd() < 0.03
      ? "  "
      : rnd() < 0.02
        ? "\t"
        : rnd() < 0.01
          ? pick([
              "\u00a0",
              "\u3000",
              "\u2028",
              "\ufeff",
              "\u2003",
              "\u205f",
              "\u1680",
            ])
          : " "
  const s =
    (rnd() < 0.02 ? " " : "") + parts.join(sep) + (rnd() < 0.02 ? "\n" : "")
  const expected = ref(s)
  const actual = twMerge(s)
  if (expected !== actual) {
    fail++
    if (fail <= 25) {
      console.log("DIFF input   =", JSON.stringify(s))
      console.log("     twMerge =", JSON.stringify(expected))
      console.log("     cn      =", JSON.stringify(actual))
    }
  }
}

console.log(`fuzz: ${ITERS} cases, ${fail} mismatches`)
process.exit(fail > 0 ? 1 : 0)
