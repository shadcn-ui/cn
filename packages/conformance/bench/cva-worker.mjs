import { readFileSync } from "node:fs"

const [, , implName, scenarioName] = process.argv

const target = await import("cn")
let cva
if (implName === "cn") cva = target.cva
else if (implName === "cnfast") cva = (await import("cnfast")).cva
else if (implName === "reference") {
  cva = (await import("class-variance-authority")).cva
} else throw new Error(`unknown implementation: ${implName}`)

const sites = JSON.parse(
  readFileSync(new URL("./cva/cva-sites.json", import.meta.url), "utf8")
)
const datasetCalls = JSON.parse(
  readFileSync(new URL("./cva/cva-calls.json", import.meta.url), "utf8")
)

const shadcnButton = {
  base: "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none",
  config: {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
}

const compoundHeavy = {
  base: "button font-semibold border rounded",
  config: {
    variants: {
      intent: {
        primary: "intent--primary",
        warning: "intent--warning",
        danger: "intent--danger",
      },
      disabled: {
        true: "is-disabled opacity-50",
        false: "is-enabled cursor-pointer",
      },
      size: {
        small: "size--small text-sm",
        medium: "size--medium text-base",
        large: "size--large text-lg",
      },
      m: { 0: "m-0", 1: "m-1" },
    },
    compoundVariants: [
      { intent: "primary", size: "medium", class: "primary-medium uppercase" },
      {
        intent: "warning",
        disabled: false,
        class: "warning-enabled text-gray-800",
      },
      {
        intent: "warning",
        disabled: true,
        class: "warning-disabled text-black",
      },
      {
        intent: ["warning", "danger"],
        class: "warning-danger !border-red-500",
      },
      {
        intent: ["warning", "danger"],
        size: "medium",
        class: "warning-danger-medium",
      },
      { disabled: true, size: "small", className: "disabled-small" },
      { intent: "primary", m: 1, className: "primary-m1" },
      {
        intent: "danger",
        disabled: false,
        size: "large",
        class: "danger-enabled-large",
      },
      { m: 0, size: "medium", class: "m0-medium" },
      { intent: "primary", disabled: false, className: "primary-enabled" },
      { class: "always-on" },
      { intent: "danger", size: ["small", "large"], class: "danger-extreme" },
    ],
    defaultVariants: {
      m: 0,
      disabled: false,
      intent: "primary",
      size: "medium",
    },
  },
}

const repeatRows = (rows, count) => {
  const repeated = []
  for (let pass = 0; pass < count; pass++) repeated.push(...rows)
  return repeated
}

const scenarios = {
  "realistic-fixed": { sites, calls: datasetCalls, shuffled: false },
  "realistic-shuffled": { sites, calls: datasetCalls, shuffled: true },
  defaults: {
    sites,
    calls: repeatRows(
      sites.map((_, index) => [index]),
      5
    ),
    shuffled: false,
  },
  "shadcn-steady": {
    sites: [shadcnButton],
    calls: repeatRows(
      [
        [0, { variant: "default", size: "default" }],
        [0, { variant: "outline", size: "sm", className: "ml-2" }],
        [0, { variant: "destructive", size: "default" }],
        [0, { variant: "ghost", size: "lg", className: "w-full" }],
        [0, {}],
        [0, { variant: "outline", size: "sm", className: "ml-2" }],
      ],
      40
    ),
    shuffled: false,
  },
  "memo-churn-fixed": { sites: [shadcnButton], calls: [], shuffled: false },
  "memo-churn-shuffled": { sites: [shadcnButton], calls: [], shuffled: true },
  "compound-heavy": {
    sites: [compoundHeavy],
    calls: repeatRows(
      [
        [0, {}],
        [0, { intent: "warning", size: "large", disabled: true }],
        [0, { intent: "danger", size: "medium" }],
        [0, { intent: "primary", m: 1 }],
        [0, { intent: "warning", disabled: false, className: "adhoc" }],
        [0, { intent: "danger", size: "small", disabled: true, m: 1 }],
      ],
      40
    ),
    shuffled: false,
  },
  "object-class": { sites: [shadcnButton], calls: [], shuffled: false },
  composite: { sites, calls: datasetCalls, shuffled: false, compose: true },
}

let churnIndex = 0
for (const variant of ["default", "destructive", "outline", "ghost"]) {
  for (const size of ["default", "sm", "lg"]) {
    scenarios["memo-churn-fixed"].calls.push([
      0,
      { variant, size, className: `churn-${churnIndex++}` },
    ])
    scenarios["memo-churn-fixed"].calls.push([0, { variant, size }])
  }
}
scenarios["memo-churn-fixed"].calls = repeatRows(
  scenarios["memo-churn-fixed"].calls,
  10
)
scenarios["memo-churn-shuffled"].calls = scenarios["memo-churn-fixed"].calls
for (let index = 0; index < 240; index++) {
  scenarios["object-class"].calls.push([
    0,
    {
      variant: "outline",
      size: "sm",
      className: { [`dynamic-${index % 7}`]: true, hidden: index % 2 === 0 },
    },
  ])
}

if (scenarioName === "creation") {
  let sink = 0
  let best = Infinity
  for (let attempt = 0; attempt < 15; attempt++) {
    const start = process.hrtime.bigint()
    for (let index = 0; index < 20_000; index++) {
      sink += cva(
        sites[index % sites.length].base,
        sites[index % sites.length].config ?? undefined
      ).length
    }
    const ns = Number(process.hrtime.bigint() - start) / 20_000
    if (ns < best) best = ns
  }
  console.log(
    JSON.stringify({
      impl: implName,
      scenario: scenarioName,
      nsPerOp: best,
      sink: sink % 10,
    })
  )
  process.exit(0)
}

const scenario = scenarios[scenarioName]
if (!scenario) throw new Error(`unknown scenario: ${scenarioName}`)
const instances = scenario.sites.map(({ base, config }) =>
  cva(base, config ?? undefined)
)
const callers = scenario.calls.map((row) => {
  const instance = instances[row[0]]
  const props = row.length === 2 ? row[1] : undefined
  if (scenario.compose) return () => target.cn(instance(props))
  return () => instance(props)
})

let randomSeed = 0xc4abe4c
const random = () => {
  randomSeed ^= randomSeed << 13
  randomSeed >>>= 0
  randomSeed ^= randomSeed >> 17
  randomSeed ^= randomSeed << 5
  randomSeed >>>= 0
  return randomSeed / 0x100000000
}
const identity = Array.from({ length: callers.length }, (_, index) => index)
const orders = [identity]
if (scenario.shuffled) {
  orders.length = 0
  for (let orderIndex = 0; orderIndex < 8; orderIndex++) {
    const order = [...identity]
    for (let index = order.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1))
      const value = order[index]
      order[index] = order[other]
      order[other] = value
    }
    orders.push(order)
  }
}

let sink = 0
const run = (order) => {
  for (const index of order) sink += callers[index]().length
}
for (let warmup = 0; warmup < 30; warmup++) run(orders[warmup % orders.length])
let best = Infinity
for (let attempt = 0; attempt < 15; attempt++) {
  const start = process.hrtime.bigint()
  for (let iteration = 0; iteration < 40; iteration++)
    run(orders[iteration % orders.length])
  const ns = Number(process.hrtime.bigint() - start) / (40 * callers.length)
  if (ns < best) best = ns
}
console.log(
  JSON.stringify({
    impl: implName,
    scenario: scenarioName,
    nsPerOp: best,
    sink: sink % 10,
  })
)
