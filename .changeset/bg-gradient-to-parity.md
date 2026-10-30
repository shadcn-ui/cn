---
"cn": patch
---

Group the legacy `bg-gradient-to-*` utilities as `bg-color`, the same as tailwind-merge. `cn("bg-background", "bg-gradient-to-r")` now returns `bg-gradient-to-r`, and `bg-gradient-to-r` no longer replaces `bg-linear-to-r` or an arbitrary `bg-[...]` image.
