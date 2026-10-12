---
"cn": patch
---

Export `CnFunction`, `Engine`, and `ClassNameValue` from `cn/config`, and those plus `ClassValue` from `cn/engine`. Exporting an inferred `createCn()` result (`export const cn = createCn({ ... })`) no longer fails with TS2742 or TS2883 in projects that emit declarations.
