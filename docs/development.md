# Development

## Layout

npm workspaces, two packages:

- `packages/cn` — the publishable package: sources, CLI, build config, and
  the table compiler script. Ships with zero runtime dependencies.
- `packages/conformance` — private, never published: the differential parity
  suites, benchmark harnesses, bundle-size gate, and the vendor script.

Run everything from the root; the scripts below delegate to the right
workspace.

## Commands

```bash
pnpm build           # tsdown → dist/ (ESM + CJS + types)
pnpm test                # build, then all suites against dist/
pnpm bench           # isolated-process benchmark matrix
pnpm size            # bundle-size gate
pnpm vendor-config   # regenerate the vendored config from tailwind-merge
pnpm compile-tables  # regenerate the default tables from the vendored config
```

Tests run against the **built artifact** (`dist/`), not the sources — what we
test is what ships.

## Generated files

Two files are generated and checked in:

- `packages/cn/src/default-config.generated.ts` — tailwind-merge's default config,
  vendored into a JSON marker form (`{$v: "isNumber"}` validators,
  `{$t: "spacing"}` theme refs) by `packages/conformance/scripts/vendor-config.mjs`,
  with cn's additive grammar fixes applied by that script.
- `packages/cn/src/tables.generated.ts` — the default tables, compiled from the vendored
  config by `packages/cn/scripts/compile-tables.mjs`.

CI's freshness job regenerates both and fails on drift, so the checked-in
artifacts always match the committed compiler + the pinned tailwind-merge
devDependency.

## When Tailwind ships new utilities

1. Bump the `tailwind-merge` devDependency (they encode the new utilities).
2. `pnpm vendor-config && pnpm build && pnpm compile-tables && pnpm build`
3. `pnpm test` — the differential suites verify parity with the new version.
4. Commit the regenerated files; release.

The default grammar currently includes fixes beyond tailwind-merge 3.6.0.
The explicit classification and merge regressions live in
`packages/conformance/tests/default-config.mjs`. Differential tests use an
independent tailwind-merge extension in `tests/reference.mjs` for these fixes;
the remaining upstream semantics stay unchanged. When updating upstream,
review both sets of additions and remove any that upstream now provides.

The Tailwind [4.1](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.1.0),
[4.2](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.2.0), and
[4.3](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.0) audit found
that masks, text shadows, overflow wrapping, field sizing, inset shadows,
logical utilities, scrollbars, and container query variants already have
coverage. Numeric auto-grid tracks were added in
[4.3.2](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.2).
Containment flags use separate groups because Tailwind's independent
`--tw-contain-*` variables allow `contain-layout contain-paint` to compose.

## CI gates (all must pass)

- typecheck, build, on Node 20/22/24
- 56K differential + 300K fuzz + custom-config + CLI e2e
- bundle-size gate (`packages/conformance/scripts/size.mjs`)
- generated-file freshness

Benchmarks run non-gating (weekly + manual) — shared CI runners are too noisy
to gate on nanoseconds.

## Releasing

Versioning and publishing are driven by [changesets](https://github.com/changesets/changesets):

1. Land your change with a changeset (`pnpm changeset` — pick the bump, write
   the changelog entry, commit the generated file).
2. `release.yml` collects pending changesets on `main` into a
   "Version Packages" PR.
3. Merging that PR bumps `cn`, updates `CHANGELOG.md`, and publishes to npm
   with provenance — after the full gate set (typecheck, build, differential
   suites at 300K fuzz, size gate) passes. Publishing authenticates via OIDC
   trusted publishing; the package's npm settings list this repo + workflow
   as a trusted publisher, and no npm token exists anywhere.

The private `conformance` package is never versioned or published.
