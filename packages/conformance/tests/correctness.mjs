// Differential correctness suite vs tailwind-merge (the reference semantics),
// run against the BUILT package (dist/). Run: node tests/correctness.mjs
import { cn, twMerge } from "cn"
import { createEngine } from "cn/engine"
import tables from "cn/tables"
import { twMerge as ref } from "tailwind-merge"

const uncached = createEngine(tables, undefined, { cacheSize: 0 }).mergeUncached

let pass = 0
let fail = 0
const failures = []
const check = (input) => {
  const expected = ref(input)
  const actual = twMerge(input)
  if (expected === actual) pass++
  else {
    fail++
    if (failures.length < 50) failures.push({ input, expected, actual })
  }
}

// ---------- 1. hand batteries -------------------------------------------------
const batteries = {
  basic: [
    "px-2 px-4",
    "p-2 px-4",
    "px-4 p-2",
    "inset-x-1 left-2",
    "left-2 inset-x-1",
    "inset-1 inset-x-2 left-3",
    "left-3 inset-x-2 inset-1",
    "m-1 mx-2 mt-3 ml-4",
    "ml-4 mt-3 mx-2 m-1",
    "overflow-hidden overflow-x-scroll",
    "gap-2 gap-x-4",
    "gap-x-4 gap-2",
    "size-4 w-2 h-2",
    "w-2 h-2 size-4",
    "flex-1 basis-4 grow-0",
    "basis-4 grow-0 flex-1",
  ],
  arbitrary: [
    "p-[3px] p-2",
    "p-2 p-[3px]",
    "text-[22px] text-lg",
    "text-lg text-[#333]",
    "bg-[url(x)] bg-red-500",
    "grid-cols-[1fr,2fr] grid-cols-3",
    "m-[calc(100%-1px)] m-2",
    "w-[calc(theme(spacing.4)-1px)] w-4",
    "text-[length:var(--x)] text-lg",
    "text-[color:var(--x)] text-red-500",
    "bg-[position:top] bg-[size:50%]",
    "font-[family-name:var(--f)] font-bold",
    "p-(--pad) p-2",
    "bg-(--c) bg-red-500",
    "w-(--w) w-[33px] w-4",
    "shadow-[0_0_2px_black] shadow-lg",
    "shadow-[inset_0_1px_0,inset_0_-1px_0] shadow-sm",
    "bg-[image:var(--i)] bg-linear-to-r",
    "font-(--w) font-(family-name:--f)",
  ],
  arbitraryProps: [
    "[color:red] text-blue-500",
    "[color:red] [color:blue]",
    "[mask-type:luminance] [mask-type:alpha]",
    "[padding:1rem] p-4",
    "[--x:1] [--x:2]",
    "[--x:1] [--y:2]",
    "hover:[color:red] hover:[color:blue]",
    "hover:[color:red] focus:[color:blue]",
    "![color:red] [color:blue]",
    "[color:red]! [color:blue]!",
    "[foo] [foo]",
    "[:x] [:y]",
  ],
  important: [
    "!p-2 p-4",
    "p-4 !p-2",
    "!p-2 !p-4",
    "p-2! p-4!",
    "p-2! !p-4",
    "!p-2 p-4!",
    "hover:!p-2 hover:p-4",
    "hover:!p-2 hover:!p-4",
    "md:!text-lg md:text-lg!",
    "! !",
    "!p-2! p-4",
    "!-inset-x-1 !-inset-x-2",
  ],
  variants: [
    "hover:md:p-2 md:hover:p-4",
    "md:hover:p-4 hover:md:p-2",
    "focus:hover:p-2 hover:focus:p-4",
    "dark:hover:text-red-500 hover:dark:text-blue-500",
    "hover:p-2 p-4",
    "p-4 hover:p-2",
    "hover:focus:active:p-1 active:focus:hover:p-2",
    "*:p-2 hover:*:p-4 *:hover:p-2",
    "before:hover:p-1 hover:before:p-2",
    "first:hover:p-2 hover:first:p-4",
    "marker:text-red-500 marker:text-blue-500",
    "file:hover:bg-red-500 hover:file:bg-blue-500",
    "[&>*]:p-2 [&>*]:p-4",
    "[&>*]:p-2 hover:[&>*]:p-4 [&>*]:hover:p-2",
    "supports-[display:grid]:p-2 supports-[display:grid]:p-4",
    "group-hover/name:p-2 group-hover/name:p-4",
    "group-hover/a:p-2 group-hover/b:p-4",
    "data-[state=open]:p-2 data-[state=open]:p-4",
    "aria-checked:p-1 aria-checked:p-3",
    "data-[a]:hover:p-1 hover:data-[a]:p-2",
    "max-md:p-2 max-md:p-4",
    "@md:p-2 @md:p-4",
    "@lg/main:p-2 @lg/main:p-4",
  ],
  postfix: [
    "text-lg/7 text-xl",
    "text-lg/7 leading-6",
    "leading-6 text-lg/8",
    "text-lg leading-6",
    "bg-red-500/50 bg-blue-500",
    "bg-red-500/50 bg-red-500/75",
    "text-lg/7 text-lg/8",
    "aspect-1/2 aspect-video",
    "aspect-video aspect-1/2",
    "w-1/2 w-full",
    "w-full w-1/2",
    "translate-x-1/2 translate-x-full",
    "@container-size/sidebar @container-size",
    "@container-size @container-size/sidebar",
    "@container/a @container/b",
    "text-lg/7! text-xl!",
    "!text-lg/7 !text-xl",
    "columns-3/4 columns-2",
    "p-2/x p-3",
  ],
  negative: [
    "-mt-2 mt-4",
    "mt-4 -mt-2",
    "-inset-x-1 left-2",
    "-m-[3px] m-2",
    "-translate-x-2 translate-x-4",
    "-z-10 z-20",
    "- -",
    "-p -p",
    "-inset-x-px inset-x-1",
  ],
  external: [
    "foo bar foo",
    "my-custom-class p-2 my-custom-class",
    "a p-2 b p-4 c",
    "p-2 P-4",
    "tw-p-2 p-2",
    "text-size-adjust-none p-1",
    "p-2 p-huge",
    "hello:world foo:bar",
    "x x x",
    "_ _",
    ". .",
    ": :",
  ],
  v4: [
    "text-shadow-sm text-shadow-lg",
    "mask-t-from-50% mask-t-from-20%",
    "rotate-x-12 rotate-x-6",
    "inset-shadow-sm shadow-lg",
    "field-sizing-content field-sizing-fixed",
    "scheme-light scheme-dark",
    "inset-ring-2 ring-4",
    "bg-linear-to-r bg-linear-45",
    "bg-conic-180 bg-radial",
    "mask-radial-closest-side mask-radial-farthest-corner",
    "translate-none translate-x-2",
    "translate-x-2 translate-none",
    "wrap-anywhere wrap-normal",
    "text-clip text-ellipsis",
    "backdrop-blur-sm backdrop-blur-lg",
    "not-italic italic",
  ],
  crossGroup: [
    "font-bold font-serif",
    "italic not-italic",
    "block flex",
    "flex block",
    "rounded-t-lg rounded-lg",
    "rounded-lg rounded-t-lg",
    "border-2 border-x-4 border-l-8",
    "border-l-8 border-x-4 border-2",
    "touch-pan-x touch-auto",
    "touch-auto touch-pan-x",
    "scroll-m-1 scroll-mx-2",
    "line-clamp-2 overflow-visible block",
    "block overflow-visible line-clamp-2",
    "fvn-ordinal normal-nums",
    "normal-nums ordinal",
    "ordinal slashed-zero normal-nums",
    "container-name @container",
    "text-wrap text-nowrap",
    "underline no-underline",
    "outline outline-1",
    "ring ring-2",
    "border border-2 border-red-500",
  ],
  whitespace: [
    "  p-2   p-4  ",
    "p-2\tp-4",
    "p-2\np-4",
    " p-2 ",
    "\tp-2\t",
    "",
    "   ",
    "\n\t",
    "p-2  p-2",
    " px-2 px-4",
    "px-2 px-4 ",
  ],
  unicodeWhitespace: [
    "p-4 p-2",
    "p-4\u3000p-2 px-1",
    "\ufeffp-4 p-2",
    "hover:p-4 hover:p-2",
    "p-4  p-2",
    "p-4   p-2",
    "text-lg text-sm text-xs",
  ],
  lookalikes: [
    "text-lg text-10xl",
    "text-sm text-2xs",
    "text-xxs text-red-500",
    "shadow-custom shadow-red-500",
    "border-hairline border-gray-200",
    "text-body-l text-red-500",
    "w-huge w-4",
    "p-tiny p-2",
  ],
}
for (const cases of Object.values(batteries)) for (const c of cases) check(c)

// ---------- 2. pairwise pool ---------------------------------------------------
const pool = [
  "p-1",
  "px-2",
  "py-3",
  "pt-4",
  "pr-1",
  "pb-2",
  "pl-3",
  "ps-1",
  "pe-2",
  "m-1",
  "mx-2",
  "my-3",
  "mt-4",
  "-mt-2",
  "m-auto",
  "m-[7px]",
  "inset-0",
  "inset-x-1",
  "inset-y-2",
  "top-3",
  "left-4",
  "start-1",
  "end-2",
  "w-4",
  "h-5",
  "size-6",
  "w-full",
  "w-auto",
  "w-1/2",
  "w-[13px]",
  "w-(--w)",
  "text-lg",
  "text-red-500",
  "text-center",
  "text-wrap",
  "text-[15px]",
  "text-[#abc]",
  "font-bold",
  "font-serif",
  "font-[600]",
  "leading-6",
  "leading-tight",
  "tracking-wide",
  "bg-red-500",
  "bg-linear-to-r",
  "bg-top",
  "bg-cover",
  "bg-fixed",
  "bg-[url(x.png)]",
  "bg-red-500/50",
  "border",
  "border-2",
  "border-x-4",
  "border-red-500",
  "border-dashed",
  "rounded",
  "rounded-lg",
  "rounded-t-md",
  "rounded-tl-sm",
  "shadow",
  "shadow-lg",
  "shadow-red-500",
  "ring",
  "ring-2",
  "ring-red-500",
  "outline",
  "outline-2",
  "flex",
  "block",
  "grid",
  "hidden",
  "inline-flex",
  "flex-row",
  "flex-col",
  "flex-1",
  "basis-4",
  "grow",
  "shrink-0",
  "gap-2",
  "gap-x-4",
  "items-center",
  "justify-between",
  "overflow-hidden",
  "overflow-x-auto",
  "truncate",
  "line-clamp-2",
  "z-10",
  "-z-10",
  "opacity-50",
  "transition",
  "duration-150",
  "ease-in",
  "scale-95",
  "rotate-45",
  "translate-x-2",
  "translate-none",
  "transform-gpu",
  "touch-auto",
  "touch-pan-x",
  "scroll-m-1",
  "scroll-mx-2",
  "scroll-p-2",
  "text-lg/7",
  "aspect-video",
  "aspect-1/2",
  "columns-2",
  "break-after-page",
  "object-cover",
  "object-top",
  "cursor-pointer",
  "select-none",
  "sr-only",
  "[color:red]",
  "[--x:1]",
  "foo",
  "underline",
  "decoration-2",
  "underline-offset-2",
  "grid-cols-3",
  "grid-cols-[1fr,2fr]",
  "col-span-2",
  "row-start-1",
  "auto-cols-fr",
  "fill-red-500",
  "stroke-2",
  "stroke-red-500",
  "divide-x-2",
  "divide-red-500",
  "space-x-2",
  "space-y-1",
  "accent-red-500",
  "caret-blue-500",
  "resize-none",
  "snap-x",
  "snap-start",
  "list-disc",
  "list-inside",
  "align-middle",
  "whitespace-nowrap",
  "break-words",
  "hyphens-auto",
  "content-none",
  "backdrop-blur-sm",
  "blur-md",
  "brightness-50",
  "contrast-125",
  "drop-shadow-md",
  "mix-blend-multiply",
  "bg-blend-screen",
  "isolation-auto",
  "isolate",
  "will-change-transform",
  "appearance-none",
  "text-shadow-sm",
  "mask-t-from-50%",
]
for (const a of pool) for (const b of pool) check(a + " " + b)

// with a shared variant prefix
const prefixes = [
  "hover:",
  "md:",
  "dark:hover:",
  "data-[state=open]:",
  "*:",
  "group-hover/x:",
]
for (const pre of prefixes) {
  for (let i = 0; i < pool.length; i += 7) {
    for (let j = 0; j < pool.length; j += 11) {
      check(pre + pool[i] + " " + pre + pool[j])
    }
  }
}

// ---------- 3. permutations of conflicting trios --------------------------------
const trios = [
  ["inset-1", "inset-x-2", "left-3"],
  ["border-2", "border-x-4", "border-l-8"],
  ["p-1", "!p-2", "p-3!"],
  ["rounded", "rounded-t-lg", "rounded-tl-sm"],
  ["m-1", "mx-2", "ml-3"],
  ["text-lg", "text-lg/7", "leading-6"],
  ["w-1", "size-2", "h-3"],
  ["touch-auto", "touch-pan-x", "touch-pinch-zoom"],
  ["scroll-m-1", "scroll-mx-2", "scroll-ml-3"],
  ["translate-none", "translate-x-1", "translate-y-2"],
  ["overflow-auto", "overflow-x-clip", "line-clamp-3"],
  ["flex-1", "basis-2", "grow-0"],
]
const permute = (arr) =>
  arr.length <= 1
    ? [arr]
    : arr.flatMap((x, i) =>
        permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])
      )
for (const trio of trios)
  for (const perm of permute(trio)) check(perm.join(" "))

// ---------- 4. seeded fuzz -------------------------------------------------------
let seed = 0xdecafbad
const rnd = () => {
  seed ^= seed << 13
  seed >>>= 0
  seed ^= seed >> 17
  seed ^= seed << 5
  seed >>>= 0
  return seed / 0x100000000
}
const fuzzPool = [
  ...pool,
  "p-[7px]",
  "w-[calc(100%-2rem)]",
  "bg-[#fff]",
  "text-[3rem]",
  "inset-[10%]",
  "hover:p-2",
  "md:flex",
  "lg:hidden",
  "dark:bg-black",
  "focus-visible:ring-2",
  "sm:hover:text-lg",
  "hover:sm:text-xl",
  "!m-4",
  "m-4!",
  "-m-2",
  "peer-checked:block",
  "has-[input]:p-1",
  "not-first:mt-2",
  "in-data-open:flex",
  "starting:opacity-0",
  "text-shadow-lg",
  "inset-shadow-xs",
  "mask-b-to-80%",
  "rotate-y-45",
  "perspective-near",
]
for (let iter = 0; iter < 30000; iter++) {
  const len = 1 + Math.floor(rnd() * 10)
  const parts = []
  for (let k = 0; k < len; k++)
    parts.push(fuzzPool[Math.floor(rnd() * fuzzPool.length)])
  check(parts.join(" "))
}

// ---------- 5. idempotence + cached-vs-uncached agreement ------------------------
let idemFail = 0
let cacheFail = 0
for (let iter = 0; iter < 3000; iter++) {
  const len = 2 + Math.floor(rnd() * 8)
  const parts = []
  for (let k = 0; k < len; k++)
    parts.push(fuzzPool[Math.floor(rnd() * fuzzPool.length)])
  const s = parts.join(" ")
  const once = twMerge(s)
  if (twMerge(once) !== once) idemFail++
  if (uncached(s) !== once) cacheFail++
}

// ---------- 6. cn join semantics (clsx parity shapes) ----------------------------
let joinFail = 0
const expectCn = (args, expected) => {
  const actual = cn(...args)
  if (actual !== expected) {
    joinFail++
    console.log("CN   args    =", JSON.stringify(args))
    console.log("     expected=", JSON.stringify(expected))
    console.log("     actual  =", JSON.stringify(actual))
  }
}
expectCn(["p-2", "p-4"], "p-4")
expectCn(["p-2", false, null, undefined, 0, "", "px-3"], "p-2 px-3")
expectCn([["p-2", ["px-3", { "py-1": true, hidden: false }]]], "p-2 px-3 py-1")
// cn merges after joining: flex and block conflict (display), block wins
expectCn([{ flex: true, block: 1, grid: 0 }], "block")
expectCn([1, 2], "1 2")
expectCn([], "")
expectCn([[]], "")
expectCn([{ "p-2": true }, "p-4"], "p-4")
expectCn([() => {}], "") // functions are truthy non-string objects → object path, no keys… but arrow has no enumerable keys

// ---------- report ---------------------------------------------------------------
console.log(
  `pass: ${pass}  fail: ${fail}  (${((100 * pass) / (pass + fail)).toFixed(3)}%)`
)
console.log(
  `idempotence failures: ${idemFail}, cached/uncached mismatches: ${cacheFail}, cn-join failures: ${joinFail}`
)
for (const f of failures) {
  console.log("DIFF input   =", JSON.stringify(f.input))
  console.log("     twMerge =", JSON.stringify(f.expected))
  console.log("     cn      =", JSON.stringify(f.actual))
}
process.exit(fail > 0 || idemFail > 0 || cacheFail > 0 || joinFail > 0 ? 1 : 0)
