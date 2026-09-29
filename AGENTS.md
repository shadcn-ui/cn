# Working on cn with Vite+

This workspace uses Vite+ for packaging, linting, and formatting. The local
toolchain is pinned in `package.json` and `pnpm-workspace.yaml`. For command
details, use `vp help`, `vp <command> --help`, or the docs in
`node_modules/vite-plus/docs`.

## Commands

- `vp <command>` runs a Vite+ built-in. `vp run <script>` runs a workspace script
  from `package.json`. Check which one you need before invoking commands such as
  `test` or `build`.
- Run `vp install` after pulling dependency changes.
- Run `vp check` for formatting and linting, then `vp run typecheck` for the
  TypeScript check.
- Run `vp run test` for the cn build and conformance suite. The built-in
  `vp test` does not run this repository's `test` script.
- Run `vp run size` when changes could affect the package size budget.
- Use `vp toolchain` to inspect bundled tool versions and `vp why <package>`
  to inspect dependency relationships.

## Import order

`vite.config.ts` configures import declaration sorting. Oxlint checks named
import members. Import sorting is disabled for `packages/cn/src/**/*.ts`
because changing import order there can affect the package size budget.
