---
"cn": minor
---

Add `cn.clearCache()` to release learned strings and oversized work buffers
after a temporary workload without unloading compiled Tailwind tables.

Add a table-free `cn/clsx` entry for aliasing dependencies such as CVA when
an application uses project-built tables from `cn/engine`.
