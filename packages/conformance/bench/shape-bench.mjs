// node shape-bench.mjs <impl> <shape>  → {nsPerOp}
const [, , implName, shape] = process.argv
const loadImpl = async () => {
  if (implName === "cnfast") return (await import("cnfast")).cn
  if (implName === "cn") return (await import("cn")).cn
  if (implName.startsWith("cn:"))
    return (await import(implName.slice(3) + "/index.js")).cn
  if (implName === "pair") {
    const { clsx } = await import("clsx")
    const { twMerge } = await import("tailwind-merge")
    return (...a) => twMerge(clsx(...a))
  }
  throw new Error(implName)
}
const fn = await loadImpl()
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
const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i))
const oneStrings = (n) => mk(n, (i) => bases[i % 8] + " z-" + i)
let calls
switch (shape) {
  case "one-16": {
    const a = oneStrings(16)
    calls = a.map((s) => [s])
    break
  }
  case "one-8k": {
    const a = oneStrings(8000)
    calls = a.map((s) => [s])
    break
  }
  case "one-20k": {
    const a = oneStrings(20000)
    calls = a.map((s) => [s])
    break
  }
  case "two-24":
    calls = mk(24, (i) => [bases[i % 8] + " z-" + i, variants[i % 8]])
    break
  case "three-24":
    calls = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      variants[i % 8],
      i % 3 !== 2 && extras[i % 4],
    ])
    break
  case "three-2k":
    calls = mk(2000, (i) => [
      bases[i % 8] + " z-" + i,
      variants[i % 8],
      i % 3 !== 2 && extras[i % 4],
    ])
    break
  case "six-24":
    calls = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      variants[i % 8],
      i % 2 === 0 && extras[i % 4],
      null,
      "rounded-md",
      i % 3 === 0 ? "shadow" : undefined,
    ])
    break
  case "object-24":
    calls = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      { "bg-accent": i % 2 === 0, "opacity-50": i % 3 === 0 },
    ])
    break
  case "object-2key-24":
    calls = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      { "bg-accent": true, "opacity-50": true, hidden: i % 2 === 0 },
    ])
    break
  case "mixed-48": {
    const o = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      { "bg-accent": i % 2 === 0, "opacity-50": i % 3 === 0 },
    ])
    const t = mk(24, (i) => [bases[i % 8] + " y-" + i, variants[i % 8]])
    calls = o.flatMap((c, i) => [c, t[i]])
    break
  }
  case "mixed-2key-48": {
    const o = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      { "bg-accent": true, "opacity-50": true, hidden: i % 2 === 0 },
    ])
    const t = mk(24, (i) => [bases[i % 8] + " y-" + i, variants[i % 8]])
    calls = o.flatMap((c, i) => [c, t[i]])
    break
  }
  case "ten-24":
    calls = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      variants[i % 8],
      i % 3 !== 2 && extras[i % 4],
      null,
      undefined,
      false,
      "rounded-md",
      i % 2 === 0 && "shadow",
      "",
      i % 5 === 0 ? extras[(i + 1) % 4] : undefined,
    ])
    break
  case "unique-arb-64": {
    let t = 0
    const b = bases.map((s, i) => s + " z-" + i)
    const orig = mk(64, (i) => [b[i % 8], variants[i % 8]])
    calls = {
      length: 64,
      get(i) {
        const c = orig[i]
        return [c[0], c[1], "w-[" + t++ + "px]"]
      },
    }
    break
  }
  case "nested-array-24":
    calls = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      [variants[i % 8], i % 2 === 0 && extras[i % 4]],
    ])
    break
  case "object-1key-24":
    calls = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      { "bg-accent": i % 2 === 0 },
    ])
    break
  case "shared-base-64": {
    const shared = bases[0] + " z-shared"
    calls = mk(64, (i) => [shared, variants[i % 8] + " y-" + i])
    break
  }
  case "shared-base-64-shuffled": {
    const shared = bases[0] + " z-shared"
    const orig = mk(64, (i) => [shared, variants[i % 8] + " y-" + i])
    let seed = 7
    calls = {
      length: 64,
      get() {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return orig[seed % 64]
      },
    }
    break
  }
  case "distinct-base-64-shuffled": {
    const orig = mk(64, (i) => [
      bases[i % 8] + " z-" + i,
      variants[i % 8] + " y-" + i,
    ])
    let seed = 7
    calls = {
      length: 64,
      get() {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return orig[seed % 64]
      },
    }
    break
  }
  case "mixed-dynamic-48": {
    let t = 0
    const stable = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      variants[i % 8],
      i % 3 !== 2 && extras[i % 4],
    ])
    const dyn = mk(24, (i) => [bases[i % 8] + " d-" + i, variants[i % 8]])
    calls = {
      length: 48,
      get(i) {
        if (i % 2 === 0) return stable[i >> 1]
        const c = dyn[i >> 1]
        return [c[0], c[1], "translate-x-[" + t++ + "px]"]
      },
    }
    break
  }
  case "stable-24-after-dynamic": {
    let t = 0
    const stable = mk(24, (i) => [
      bases[i % 8] + " z-" + i,
      variants[i % 8],
      i % 3 !== 2 && extras[i % 4],
    ])
    const dynBase = bases[1] + " d"
    calls = {
      length: 48,
      get(i) {
        if (i < 24) return stable[i]
        return [dynBase, "w-[" + t++ + "px]"]
      },
    }
    break
  }
  case "shared-base-256": {
    const shared = bases[0] + " z-shared"
    calls = mk(256, (i) => [shared, variants[i % 8] + " y-" + i])
    break
  }
  case "shared-base-256-shuffled": {
    const shared = bases[0] + " z-shared"
    const orig = mk(256, (i) => [shared, variants[i % 8] + " y-" + i])
    let seed = 7
    calls = {
      length: 256,
      get() {
        seed = (seed * 1664525 + 1013904223) >>> 0
        return orig[seed % 256]
      },
    }
    break
  }
  case "unique-arb-short-base": {
    let t = 0
    calls = {
      length: 64,
      get() {
        return ["flex", "w-[" + t++ + "px]"]
      },
    }
    break
  }
  case "unique-arb-long-base": {
    let t = 0
    const b = bases[1] + " " + variants[0] + " " + extras[1]
    calls = {
      length: 64,
      get() {
        return [b, "w-[" + t++ + "px]"]
      },
    }
    break
  }
  case "array-24":
    calls = mk(24, (i) => [[bases[i % 8] + " z-" + i, variants[i % 8]]])
    break
  case "fresh-className-64": {
    // stable base + a className prop that is a *fresh* string each render (template literal)
    const b = bases.map((s, i) => s + " z-" + i)
    calls = mk(64, (i) => [b[i % 8], variants[i % 8]])
    let tick = 0
    const orig = calls
    calls = {
      length: orig.length,
      get(i) {
        const c = orig[i]
        return [c[0], c[1], "w-" + ((tick++ % 12) + 1)]
      },
    }
    break
  }
  default:
    throw new Error(shape)
}
const isDyn = !Array.isArray(calls)
const N = calls.length
let sink = 0
const pass = (n) => {
  let s = 0
  for (let i = 0, k = 0; i < n; i++) {
    const c = isDyn ? calls.get(k) : calls[k]
    s += (
      c.length === 1
        ? fn(c[0])
        : c.length === 2
          ? fn(c[0], c[1])
          : c.length === 3
            ? fn(c[0], c[1], c[2])
            : fn(...c)
    ).length
    if (++k === N) k = 0
  }
  return s
}
const ITERS = Math.max(N * 20, 3_000_000)
sink += pass(ITERS >> 2)
let best = Infinity
for (let b = 0; b < 5; b++) {
  const per = Math.ceil(ITERS / 5)
  const t0 = performance.now()
  sink += pass(per)
  const ns = ((performance.now() - t0) * 1e6) / per
  if (ns < best) best = ns
}
console.log(
  JSON.stringify({ impl: implName, shape, nsPerOp: best, sink: sink % 10 })
)
