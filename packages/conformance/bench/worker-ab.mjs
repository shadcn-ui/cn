// One (impl × workload) measurement in an isolated process.
// Usage: node bench/worker.mjs <impl> <workload>   → prints JSON {nsPerOp}
const [, , implName, workloadName] = process.argv

// ---- corpora (seeded, deterministic) ----------------------------------------
let seed = 0xc0ffee
const rnd = () => {
  seed ^= seed << 13
  seed >>>= 0
  seed ^= seed >> 17
  seed ^= seed << 5
  seed >>>= 0
  return seed / 0x100000000
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

const shortTypical = [
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  "bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2",
  "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
  "text-muted-foreground text-sm",
  "font-semibold leading-none tracking-tight",
  "absolute right-4 top-4 rounded-sm opacity-70 transition-opacity",
  "fixed inset-0 z-50 bg-black/80",
  "grid gap-4 py-4",
  "flex flex-col space-y-1.5",
  "p-6 pt-0",
  "text-lg font-semibold",
  "mr-2 h-4 w-4",
  "h-px w-full bg-border",
  "px-2 py-1 text-xs",
  "w-full p-4 md:p-6 lg:px-8",
]

const variantPool = [
  "hover:",
  "focus:",
  "md:",
  "lg:",
  "dark:",
  "group-hover:",
  "data-[state=open]:",
  "aria-checked:",
]
const basePool = [
  "p-1",
  "px-2",
  "m-3",
  "w-4",
  "text-lg",
  "bg-red-500",
  "flex",
  "rounded-md",
  "border-2",
  "gap-2",
  "shadow-lg",
  "opacity-50",
  "z-10",
  "top-1",
  "inset-x-2",
]
const longVariants = Array.from({ length: 64 }, () =>
  Array.from({ length: 30 }, () => {
    let v = ""
    const nv = Math.floor(rnd() * 3)
    for (let i = 0; i < nv; i++) v += pick(variantPool)
    return v + pick(basePool)
  }).join(" ")
)

const arbHeavy = Array.from(
  { length: 50000 },
  (_, i) =>
    `w-[${i}px] h-[${i * 2}px] bg-[#${(i % 4096).toString(16).padStart(3, "0")}] ` +
    `translate-x-[${i % 100}%] p-[${i % 50}rem] text-[${10 + (i % 20)}px] ` +
    `m-[calc(100%-${i}px)] rounded-[${i % 24}px]`
)

const vocab = [
  "flex",
  "inline-flex",
  "grid",
  "block",
  "items-center",
  "items-start",
  "justify-between",
  "justify-center",
  "gap-1",
  "gap-2",
  "gap-4",
  "p-1",
  "p-2",
  "p-4",
  "px-2",
  "px-3",
  "px-4",
  "py-1",
  "py-2",
  "rounded",
  "rounded-md",
  "rounded-lg",
  "border",
  "border-input",
  "bg-background",
  "bg-primary",
  "bg-accent",
  "text-sm",
  "text-xs",
  "text-lg",
  "font-medium",
  "font-semibold",
  "text-muted-foreground",
  "text-primary-foreground",
  "shadow-sm",
  "shadow",
  "transition-colors",
  "hover:bg-accent",
  "hover:text-white",
  "focus:ring-2",
  "md:flex-row",
  "md:p-6",
  "dark:bg-gray-900",
  "w-full",
  "h-10",
  "h-9",
  "opacity-50",
  "underline",
  "truncate",
  "overflow-hidden",
  "relative",
  "absolute",
]
const ssrUnique = Array.from({ length: 50000 }, () => {
  const len = 3 + Math.floor(rnd() * 9)
  const parts = []
  for (let k = 0; k < len; k++) parts.push(pick(vocab))
  return parts.join(" ")
})
{
  const seen = new Set()
  for (let i = 0; i < ssrUnique.length; i++) {
    if (seen.has(ssrUnique[i])) ssrUnique[i] += " z-" + i
    seen.add(ssrUnique[i])
  }
}

const repeated = [
  "inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm hover:bg-primary/90",
]

// large recurring working set: thousands of distinct strings, all repeating —
// the regime real repos live in (and the one that caught the doorkeeper
// regression: recurring sets bigger than the admission filter must still warm)
const workset = ssrUnique.slice(0, 8000)

const workloads = {
  short: { arr: shortTypical, iters: 2_000_000 },
  long: { arr: longVariants, iters: 1_000_000 },
  arb: { arr: arbHeavy, iters: 300_000 },
  repeat: { arr: repeated, iters: 5_000_000 },
  ssr: { arr: ssrUnique, iters: 600_000 },
  workset: { arr: workset, iters: 2_000_000 },
}

// ---- impls -------------------------------------------------------------------
const loadImpl = async () => {
  if (implName === "tailwind-merge")
    return (await import("tailwind-merge")).twMerge
  if (implName === "pair") {
    const { clsx } = await import("clsx")
    const { twMerge } = await import("tailwind-merge")
    return (...a) => twMerge(clsx(...a))
  }
  if (implName === "cnfast") return (await import("cnfast")).cn
  if (implName === "cn") return (await import("cn")).twMerge
  if (implName.startsWith("cn:"))
    return (await import(implName.slice(3) + "/index.js")).twMerge
  if (implName === "cn-nocache") {
    const { createEngine } = await import("cn/engine")
    const tables = (await import("cn/tables")).default
    return createEngine(tables, undefined, { cacheSize: 0 }).mergeUncached
  }
  throw new Error("unknown impl " + implName)
}

const fn = await loadImpl()
const { arr, iters } = workloads[workloadName]
let sink = 0

// warmup: 25% of measured iterations
const warm = Math.max(arr.length, iters >> 2)
for (let i = 0, k = 0; i < warm; i++) {
  sink += fn(arr[k]).length
  if (++k === arr.length) k = 0
}

// measure: best of 5 blocks
let best = Infinity
for (let block = 0; block < 5; block++) {
  const per = Math.ceil(iters / 5)
  const t0 = performance.now()
  for (let i = 0, k = 0; i < per; i++) {
    sink += fn(arr[k]).length
    if (++k === arr.length) k = 0
  }
  const ns = ((performance.now() - t0) * 1e6) / per
  if (ns < best) best = ns
}

console.log(
  JSON.stringify({
    impl: implName,
    workload: workloadName,
    nsPerOp: best,
    sink: sink % 10,
  })
)
