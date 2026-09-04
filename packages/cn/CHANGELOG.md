# cn

## 0.2.5

### Patch Changes

- [#16](https://github.com/shadcn-ui/cn/pull/16) [`014ad31`](https://github.com/shadcn-ui/cn/commit/014ad31d79afda5609720b4591f664fdb29d76e9) Thanks [@aidenybai](https://github.com/aidenybai)! - Accept a single class or theme definition in an extension instead of throwing.

- [#22](https://github.com/shadcn-ui/cn/pull/22) [`5135277`](https://github.com/shadcn-ui/cn/commit/513527747a3c6de7e38b563553713b0a764b95ca) Thanks [@aidenybai](https://github.com/aidenybai)! - Exclude the generated output file from content scans when its path matches a content glob.

- [#17](https://github.com/shadcn-ui/cn/pull/17) [`6f421fc`](https://github.com/shadcn-ui/cn/commit/6f421fc00396a0eea653dfc2fb6678d6b6e1b415) Thanks [@aidenybai](https://github.com/aidenybai)! - Accept readonly arrays in config extensions. This lets token tuples declared
  with `as const` work without a defensive copy.

## 0.2.4

### Patch Changes

- [#12](https://github.com/shadcn-ui/cn/pull/12) [`b6caaa3`](https://github.com/shadcn-ui/cn/commit/b6caaa346028fdd901ff7232adc37dda11b11fb7) Thanks [@shadcn](https://github.com/shadcn)! - Fix `cn build --content` brace globs, dot-directory and symlink scanning, and CLI error reporting.

- [#12](https://github.com/shadcn-ui/cn/pull/12) [`b6caaa3`](https://github.com/shadcn-ui/cn/commit/b6caaa346028fdd901ff7232adc37dda11b11fb7) Thanks [@shadcn](https://github.com/shadcn)! - Fix a hang and dropped classes in conflict tracking for large custom configs and merges.

- [#12](https://github.com/shadcn-ui/cn/pull/12) [`b6caaa3`](https://github.com/shadcn-ui/cn/commit/b6caaa346028fdd901ff7232adc37dda11b11fb7) Thanks [@shadcn](https://github.com/shadcn)! - Match tailwind-merge on Unicode whitespace and `twJoin` array-like values.

## 0.2.3

### Patch Changes

- [#10](https://github.com/shadcn-ui/cn/pull/10) [`bf918c2`](https://github.com/shadcn-ui/cn/commit/bf918c26831c2bece0e779f78bf5fd0f2d7a57e0) Thanks [@aidenybai](https://github.com/aidenybai)! - perf: non-string arguments and JSC hit path.
  
  - Object and array arguments resolve in place and ride the argument-identity cache instead of taking a full clsx join on every call; the prediction probe runs again over the resolved strings, so `cn(base, { active: isActive })` verifies by identity like an all-string call. 0.83× to 0.88× per call on object and nested-array shapes on node, similar on bun.
  - A single array argument takes the argument path (`cn([a, b])` is `cn(a, b)` under clsx flattening), so stable element identities hit: 0.10× on node, 0.15× on bun.
  - An argument-cache bucket holds 256 tuples instead of 8. The cache keys on the first argument, a component's base string at every usage site, so one key routinely carries dozens of tuples; the old cap evicted them faster than the sequence chain could learn them. 64 sites sharing a base: 301 ns to 6.4 ns per call on node, 153 ns to 5.4 ns on bun.
  - A freshly joined string (the arg-cache miss path) goes through the doorkeeper before the whole-string cache. A first sighting merges straight through with no dictionary lookup on a never-seen key (V8 hashes and internalizes those: ~200 ns at 17 chars, ~1.1 µs at 360) and no cache entry anywhere, so a site with a dynamic arbitrary value (`translate-x-[${x}px]`) stops churning both caches: 0.16× to 0.43× per call on node, 0.14× to 0.58× on bun. The doorkeeper hash now also folds the first and last eight characters, where arbitrary values keep their digits, which cuts cold arbitrary-value renders to 0.83× on node and 0.78× on bun.
  - On JavaScriptCore the whole-string cache is a Map: JSC looks up a string key in a dictionary-mode object in ~21 ns and a fresh key in ~220 ns, where a Map takes 6 and 75 (V8 is the reverse and keeps the dictionary). 8k-string working sets on bun: 25 ns to 6.6 ns per hit, SSR streams 0.92×; 16-string sets pay ~0.5 ns.
  - On JavaScriptCore the whole-string cache hit is a tiny inlinable front with the miss body outlined: recurring single-string calls 0.62× to 0.71× on bun. V8 keeps the single-closure form, where the outlined body measured 1.17× on long strings.
  
  All-string call shapes are unchanged on both engines. Size gate: 10,602 gz.

## 0.2.2

### Patch Changes

- [#6](https://github.com/shadcn-ui/cn/pull/6) [`9018306`](https://github.com/shadcn-ui/cn/commit/9018306b788de760eb9c1e0104a6daef512f08a0) Thanks [@shadcn](https://github.com/shadcn)! - Fix conflict detection silently failing after 2^31 cache-missing merges in one process.

- [#4](https://github.com/shadcn-ui/cn/pull/4) [`67e2d93`](https://github.com/shadcn-ui/cn/commit/67e2d93c0ee5f3351c772f9718b8101c7d4b15e8) Thanks [@shadcn](https://github.com/shadcn)! - Fix broken published types: `cn/config` pointed at an internal chunk with mangled export names (no `defaultConfig`/`mergeConfigs`) and `cn/lite` typed `clsx` with zero parameters — runtime was unaffected, and the build now gates on every entry's declarations.

## 0.2.1

### Patch Changes

- [#2](https://github.com/shadcn-ui/cn/pull/2) [`fafd8cf`](https://github.com/shadcn-ui/cn/commit/fafd8cfb729ae773e4a81e92525b8c42d7927ab8) Thanks [@shadcn](https://github.com/shadcn)! - Faster many-argument calls: predictions are now probed in place, so a warm 4+ argument call allocates nothing (~44ns → ~32ns).

## 0.2.0

### Minor Changes

- [`8bc9724`](https://github.com/shadcn-ui/cn/commit/8bc9724d6ad3943e002fe3dc2ab8dea2b2684d8b) Thanks [@shadcn](https://github.com/shadcn)! - initial release of cn
