---
"cn": patch
---

Fix conflict tracking for custom configs with large conflict fan-out (a merge could hang) and for merges with thousands of distinct arbitrary properties (classes were silently dropped); bound the variant-prefix intern cache.
