# cn

`cn` is a [new engine](https://github.com/shadcn-ui/cn/blob/main/docs/how-it-works.md) for Tailwind class merging and
conflict resolution. It replaces `tailwind-merge` and `clsx`. Same APIs.
Full parity. **And it is [30× faster](#how-much-faster).**

```ts
import { cn } from "cn"

// conditional joining (like clsx) + conflict resolution (like tailwind-merge)
cn("px-2 py-1", isActive && "bg-blue-500", { "text-white": isActive })
```

`cn` has zero dependencies and is framework-agnostic: it works with React,
Vue, Svelte, Solid, Astro, or plain server templates, and runs in browsers,
Node, Bun, Deno, and edge runtimes. **It works in any Tailwind CSS project. You don't need shadcn/ui.**

`cn` is built and maintained by [aidenybai](https://x.com/aidenybai) and [shadcn](https://x.com/shadcn).

## Can I use this today?

Yes. You can replace `tailwind-merge` and `clsx` with `cn` today. It's a drop-in replacement.

Here's a command to migrate:

```bash
npx shadcn@latest migrate cn
```

## Install

```bash
npm i cn
```

### New project

Import it and go. Nothing to configure:

```tsx
import { cn } from "cn"

export function Button({
  className,
  active,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "rounded-md px-4 py-2 text-sm",
        active && "bg-primary",
        className
      )}
      {...props}
    />
  )
}
```

### Existing shadcn/ui project

#### Using the `shadcn` CLI

```bash
npx shadcn@latest migrate cn
```

#### Manually

Your components already import `cn` from `@/lib/utils`. Replace the wrapper with the one from `cn`.

```diff
// lib/utils.ts
- import { clsx, type ClassValue } from "clsx";
- import { twMerge } from "tailwind-merge";

- export function cn(...inputs: ClassValue[]) {
-   return twMerge(clsx(inputs));
- }
+ export { cn } from "cn";
```

Then remove `clsx` and `tailwind-merge` from your dependencies. If other
packages still import them, [alias them to `cn`](https://github.com/shadcn-ui/cn/blob/main/docs/aliasing.md)
so your bundle only carries one implementation.

## How much faster?

The following benchmarks compare `cn` against `clsx` + `tailwind-merge`,
which is what most projects run today.

We ran each library through every workload in its own isolated process with
its own warmup, and kept the best of 5 runs.

To see the results for yourself, run `pnpm bench`. The methodology is
in [docs/how-it-works.md](https://github.com/shadcn-ui/cn/blob/main/docs/how-it-works.md#benchmark-methodology).

| scenario                                                   | clsx + tailwind-merge |     cn | faster |
| ---------------------------------------------------------- | --------------------: | -----: | -----: |
| the call your components make most¹                        |                320 ns |  10 ns |    30× |
| same classes as last render (cache hit)                    |                 14 ns |   7 ns |   1.9× |
| typical component strings, warm                            |                 13 ns |   7 ns |   1.9× |
| thousands of recurring strings (a real repo's working set) |                2.4 µs |  14 ns |   172× |
| cold render, many arbitrary values                         |                3.4 µs | 1.1 µs |   3.0× |
| cold render, SSR-style unique strings                      |                2.3 µs | 360 ns |   6.4× |
| very first call (page load)                                |                3.2 ms | 0.4 ms |     7× |

¹ `cn(base, variant, condition && extra)` with stable class strings. This is
the shape almost every component call has. `cn` learns repeated call
sequences, so a render loop's calls verify by identity and skip the work
entirely.

### Real repositories

The rows above are synthetic. `pnpm bench:corpus` replays every `cn()` call
harvested from 58 open source codebases (144,265 calls) through each
library, one isolated process per library and repository, and prints the
per-repository table. Geometric mean across the 58 repositories: `cn` is
**37× faster** than `clsx` + `tailwind-merge`.

`cn` ships the least JavaScript to parse in every setup, 26 KB minified.

If you want an even smaller bundle with the same performance, see
[`cn build`](https://github.com/shadcn-ui/cn/blob/main/docs/build-setup.md).

## Custom themes

`cn/config` accepts the same `{ extend, override, prefix }` shape, under the
same name:

```ts
// before
import { extendTailwindMerge } from "tailwind-merge"

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["hero"] }] } },
})
```

```ts
// after
import { createCn } from "cn/config"

const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: ["hero"] }] } },
})
```

Custom validator functions work as-is. `fromTheme`, `validators`,
`mergeConfigs`, and `defaultConfig` are exported from `cn/config`. Tailwind
v4 prefixes are supported: `createCn({ prefix: "tw" })`.

## Coming from tailwind-merge

`cn` produces the same output as tailwind-merge for every input. We verify
this with 356,000 differential tests.

Every export maps to the same name or a familiar one:

| tailwind-merge               | cn                                     |
| ---------------------------- | -------------------------------------- |
| `twMerge(...)`               | `twMerge(...)` from `"cn"`, identical  |
| `twJoin(...)`                | `twJoin(...)` from `"cn"`, identical   |
| `extendTailwindMerge(ext)`   | same name, from `"cn/config"`          |
| `createTailwindMerge(fn)`    | `createTwMerge(fn)` from `"cn/config"` |
| `getDefaultConfig()`         | `defaultConfig()` from `"cn/config"`   |
| `fromTheme`, `validators`    | same names, from `"cn/config"`         |
| `mergeConfigs`               | same name, from `"cn/config"`          |
| `experimentalParseClassName` | not supported                          |

## Gotchas

- `cn` supports Tailwind CSS v4, like tailwind-merge v3. On Tailwind v3,
  stay with tailwind-merge v2.
- Classes that merely _look like_ Tailwind utilities (`text-2xs`) are
  treated as Tailwind utilities. Same behavior and guidance as
  [tailwind-merge's docs](https://github.com/dcastil/tailwind-merge/blob/main/docs/limitations.md).
- With [`cn build`](https://github.com/shadcn-ui/cn/blob/main/docs/build-setup.md), dynamically constructed class names (`"p-" + size`) can't
  be detected. Same rule as Tailwind itself. Use `--safelist`.
- The CLI needs Node 20+.

## API

- **`cn`**: `cn(...inputs)`, `twMerge(...)`, `twJoin(...)`, `clsx(...)`
- **`cn/config`**: `createCn(ext?)`, `extendTailwindMerge(ext?)`,
  `createTwMerge(ext?)`, `fromTheme`, `validators`, `defaultConfig()`,
  `mergeConfigs(base, ext)`
- **`cn/engine`**: `createCn(tables, ...)`, `createEngine(tables, ...)` for
  build-time compiled tables
- **`cn/lite`**: `clsx(...)`, strings-only join (`clsx/lite` parity)
- **CLI**: `npx cn build --help`

## Credits

- `cn`'s merge engine, compiler, and table format are original work.
- The package's conflict-resolution **semantics** intentionally match those of
  [tailwind-merge](https://github.com/dcastil/tailwind-merge) by Dany Castillo
  (MIT licensed), and the default tables it ships are compiled from
  tailwind-merge's default configuration.
- The `clsx`-compatible join layer implements the argument semantics of
  [clsx](https://github.com/lukeed/clsx) by Luke Edwards (MIT licensed).
- The argument-identity cache for repeated variadic calls re-implements an optimization pioneered by
  [cnfast](https://github.com/aidenybai/cnfast) by Aiden Bai (MIT licensed).

Thank you to all three authors.
