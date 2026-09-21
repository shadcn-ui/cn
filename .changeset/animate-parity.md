---
"cn": patch
---

Custom `animate-*` classes are no longer merged, matching tailwind-merge. Only the default theme animations (`spin`, `ping`, `pulse`, `bounce`), `animate-none`, and arbitrary values share the `animate` group, so plugin classes such as `animate-in`, `animate-once`, and `animate-duration-500` are never dropped.
