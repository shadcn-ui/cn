# Aliasing tailwind-merge and clsx to cn

Libraries in `node_modules` may still import `tailwind-merge` or `clsx`,
which keeps both in your bundle after you migrate your own code. Use exact
aliases so package subpaths do not change by accident:

```ts
// vite.config.ts
resolve: {
  alias: [
    { find: /^tailwind-merge$/, replacement: "cn" },
    { find: /^clsx$/, replacement: "cn/clsx" },
    { find: /^clsx\/lite$/, replacement: "cn/lite" },
  ],
}
```

```js
// next.config.js
webpack: (config) => {
  config.resolve.alias["tailwind-merge$"] = "cn"
  config.resolve.alias["clsx$"] = "cn/clsx"
  config.resolve.alias["clsx/lite$"] = "cn/lite"
  return config
}
```

`cn/clsx` implements the full `clsx` argument behavior without importing a
Tailwind table. `cn/lite` mirrors `clsx/lite`. The root `cn` entry supplies
`twMerge` and `twJoin` with the default Tailwind table.

## Project-built tables

If your application uses `createCn(tables)` from `cn/engine`, keep the exact
`clsx` aliases above. They let packages such as CVA share the table-free join
code without adding the default Tailwind table.

Do not alias `tailwind-merge` to the root `cn` entry in this setup. The root
entry owns the default table. Change those calls to use your bound `cn`
function, or provide an application adapter that exports a `twMerge` bound to
your generated tables.

Safe to try: if a library needs something the alias can't provide, your
build fails with a clear error. Nothing changes silently.

## Known limits

- A library that bundles its own copy of the merge code is unaffected by
  aliases (tailwind-variants v3 does this; there is no import to intercept).
- A file that calls `extendTailwindMerge` needs its import changed to
  `"cn/config"` by hand. In an app, that is typically one utils file.
- Imports other than `clsx`, `clsx/lite`, and the documented
  `tailwind-merge` names are not compatibility targets.
