---
"cn": patch
---

perf: non-string arguments and JSC hit path.

- Object and array arguments resolve in place and ride the argument-identity cache instead of taking a full clsx join on every call; the prediction probe runs again over the resolved strings, so `cn(base, { active: isActive })` verifies by identity like an all-string call. 0.83× to 0.88× per call on object and nested-array shapes on node, similar on bun.
- A single array argument takes the argument path (`cn([a, b])` is `cn(a, b)` under clsx flattening), so stable element identities hit: 0.10× on node, 0.15× on bun.
- An argument-cache bucket holds 256 tuples instead of 8. The cache keys on the first argument, a component's base string at every usage site, so one key routinely carries dozens of tuples; the old cap evicted them faster than the sequence chain could learn them. 64 sites sharing a base: 301 ns to 6.4 ns per call on node, 153 ns to 5.4 ns on bun.
- On JavaScriptCore the whole-string cache hit is a tiny inlinable front with the miss body outlined: recurring single-string calls 0.62× to 0.71× on bun. V8 keeps the single-closure form, where the outlined body measured 1.17× on long strings.

All-string call shapes are unchanged on both engines. Size gate: 10,423 gz.
