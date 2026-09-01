# cn

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
