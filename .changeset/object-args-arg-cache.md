---
"cn": patch
---

perf: object and array arguments now resolve in place and ride the argument-identity cache instead of taking a full clsx join on every call. A one-key object resolves to its key string itself, so `cn(base, { active: isActive })` verifies by identity like an all-string call. Measured 0.38× to 0.56× of the previous per-call time on object-syntax shapes (node and bun); all-string shapes unchanged.
