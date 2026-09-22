// The README headline workload: cn(base, variant, cond && extra) with stable
// string identities — the shape almost every component call has. Modes:
//   single   — one stable call site repeating (a page dominated by one component)
//   loop     — render loop over 24 call sites, all argument tuples unique
//   dup-loop — render loop where some sites share identical argument tuples,
//              so single-successor sequence prediction can't lock on
//   interp   — one stable base, second arg a fresh interpolated string per
//              call (1,000 distinct values cycling): the arg cache can never
//              hit by identity, so the bucket must learn to step aside
// Usage: node component-worker.mjs <impl> <mode>   → prints JSON {nsPerOp}
const [, , implName, mode = "single"] = process.argv

const loadImpl = async () => {
  if (implName === "pair") {
    const { clsx } = await import("clsx")
    const { twMerge } = await import("tailwind-merge")
    return (...a) => twMerge(clsx(...a))
  }
  if (implName === "cnfast") return (await import("cnfast")).cn
  if (implName === "cn") return (await import("cn")).cn
  throw new Error("unknown impl " + implName)
}

// 24 simulated component call sites with stable literals (module-scope in real
// apps). Two thirds render with the condition true, one third false — both
// shapes appear in every render pass.
const bases = [
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
  "absolute right-4 top-4 rounded-sm opacity-70 transition-opacity",
  "grid gap-4 py-4",
  "p-6 pt-0",
  "text-lg font-semibold leading-none tracking-tight",
  "fixed inset-0 z-50 bg-black/80",
  "mr-2 h-4 w-4",
]
const variants = [
  "bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2",
  "border border-input bg-background hover:bg-accent",
  "text-muted-foreground text-sm",
  "px-2 py-1 text-xs",
  "w-full p-4 md:p-6",
  "bg-destructive text-destructive-foreground",
  "underline-offset-4 hover:underline",
  "h-9 rounded-md px-3",
]
const extras = [
  "opacity-50 pointer-events-none",
  "ring-2 ring-ring ring-offset-2",
  "bg-accent text-accent-foreground",
  "border-primary",
]

const sites = []
if (mode === "single") {
  sites.push({
    base: bases[0],
    variant: variants[0],
    cond: true,
    extra: extras[0],
  })
} else {
  for (let i = 0; i < 24; i++) {
    sites.push({
      // 'loop' gives every site a distinct stable base instance (z-<i> is a
      // real utility) so all 24 tuples are unique; 'dup-loop' reuses the
      // pools directly, which makes e.g. sites 0 and 16 identical tuples
      base:
        mode === "loop"
          ? bases[i % bases.length] + " z-" + i
          : bases[i % bases.length],
      variant: variants[i % variants.length],
      cond: i % 3 !== 2,
      extra: extras[i % extras.length],
    })
  }
}

const fn = await loadImpl()
const ITERS = mode === "interp" ? 1_500_000 : 6_000_000
let sink = 0

const pass =
  mode === "interp"
    ? (n) => {
        let s = 0
        for (let i = 0, k = 0; i < n; i++) {
          s += fn(
            "inline-block w-2 h-2",
            "[transform:translateX(" + k + "px)]"
          ).length
          if (++k === 1000) k = 0
        }
        return s
      }
    : (n) => {
        let s = 0
        for (let i = 0, k = 0; i < n; i++) {
          const site = sites[k]
          s += fn(site.base, site.variant, site.cond && site.extra).length
          if (++k === sites.length) k = 0
        }
        return s
      }

sink += pass(ITERS >> 2) // warmup
let best = Infinity
for (let block = 0; block < 5; block++) {
  const per = Math.ceil(ITERS / 5)
  const t0 = performance.now()
  sink += pass(per)
  const ns = ((performance.now() - t0) * 1e6) / per
  if (ns < best) best = ns
}
console.log(
  JSON.stringify({ impl: implName, mode, nsPerOp: best, sink: sink % 10 })
)
