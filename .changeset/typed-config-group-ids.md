---
"cn": patch
---

`createCn`, `createTwMerge`, and `extendTailwindMerge` from `cn/config` accept optional type arguments for custom class-group and theme ids, like tailwind-merge's `extendTailwindMerge<ClassGroupIds, ThemeGroupIds>`. With them, unknown group keys and conflict ids are type errors. Without them, any id is still accepted.
