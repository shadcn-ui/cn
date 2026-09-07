---
"cn": minor
---

Add `cn/vite` and `cn/next`. The plugins generate project-fitted tables before the first module resolves and, in dev, regenerate them only when an edit uses a class group the current tables dropped. `build()` now leaves an identical output file untouched and reports `changed`, and `cn/build` gains `createBuilder` and `createContentMatcher` for other integrations.
