# Aliasing tailwind-merge and clsx to cn

Libraries in `node_modules` may still import `tailwind-merge` or `clsx`,
which keeps both in your bundle after you migrate your own code. Alias them
to `cn`:

```ts
// vite.config.ts
resolve: { alias: { "tailwind-merge": "cn", clsx: "cn" } }
```

```ts
// next.config.ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      clsx: "cn",
      "tailwind-merge": "cn",
    },
  },
}

export default nextConfig
```

Next.js 16 builds with Turbopack by default. If your project builds with
`next build --webpack`, alias through the webpack config instead:

```js
// next.config.js
webpack: (config) => {
  config.resolve.alias["tailwind-merge"] = "cn"
  config.resolve.alias["clsx"] = "cn"
  return config
}
```

This works because `cn` exports drop-in `twMerge`, `twJoin`, and `clsx`
functions, plus a `cn/lite` entry that mirrors `clsx/lite`. The old packages
drop out of your bundle, and your whole app merges classes the same way.

Safe to try: if a library needs something the alias can't provide, your
build fails with a clear error. Nothing changes silently.

## Known limits

- A library that bundles its own copy of the merge code is unaffected by
  aliases (tailwind-variants v3 does this; there is no import to intercept).
- A file that calls `extendTailwindMerge` needs its import changed to
  `"cn/config"` by hand. In an app, that is typically one utils file.
- Code that default-imports clsx (`import clsx from "clsx"`) won't resolve
  through the alias; named imports (`import { clsx }`) are the common case
  and work.
