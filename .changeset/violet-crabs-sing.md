---
"cn": patch
---

Fix broken published types: `cn/config` pointed at an internal chunk with mangled export names (no `defaultConfig`/`mergeConfigs`) and `cn/lite` typed `clsx` with zero parameters — runtime was unaffected, and the build now gates on every entry's declarations.
