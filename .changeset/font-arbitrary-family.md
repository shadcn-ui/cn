---
"cn": patch
---

An unlabeled arbitrary `font-[…]` merges the way Tailwind v4 compiles it. Font names such as `font-[Inter]` and `font-['Open_Sans']` are font-family; numbers, `var()` and math functions such as `font-[600]` stay font-weight. `font-medium font-[Inter]` now keeps both classes, and `font-sans font-[Inter]` keeps only `font-[Inter]`.
