# How cn works

You don't need this to use `cn`. This is for the curious.

## The short version

tailwind-merge ships Tailwind's conflict rules as a config object — ~380
class groups — and interprets it at runtime, on every call: split each class
on `-`, walk a `Map` trie, run regex validators, track conflicts with string
keys. In your render loop.

`cn` runs that interpretation once, at compile time, and ships the result.
That's the whole trick.

## The engine

A [compiler](../packages/cn/src/compiler.ts) reads the same config shape and
emits [flat lookup tables](../packages/cn/src/tables.generated.ts). The
[runtime](../packages/cn/src/engine.ts) is a single pass over the input
string: classes feed a character trie stored in typed arrays, validators run
directly against spans of the input, variant and conflict checks are integer
compares, and survivors are sliced from the input exactly once. A merge that
drops nothing returns your original string. No substrings, no regex, no
allocation per class.

Real renders repeat themselves, so three caches sit on top:

- **Argument cache.** Components call `cn(base, variant, cond && x)` with
  the same string instances every render. `cn` pointer-compares the
  arguments and returns the cached result. It also learns call _sequences_,
  so a render loop skips even the lookup — about 10 ns per predicted call.
  That's the 30× headline. (Idea from cnfast — see
  [Credits](../README.md#credits).)
- **Whole-string cache.** A string must show up twice before it's admitted.
  One-off SSR strings never churn the cache; real working sets warm fully.
- **Token memo.** Repeated classes inside new strings stay cheap.

These caches are bounded. If an application knows that a large temporary
class-string workload is finished, `cn.clearCache()` releases its learned
strings and returns oversized work buffers to their initial sizes. Compiled
Tailwind tables stay loaded. Normal applications do not need to call it.

## What this buys you

1. **Speed.** No config interpretation at runtime.
2. **Instant startup.** tailwind-merge builds its trie on first call
   (~3.2 ms). `cn` fills typed arrays (~0.4 ms).
3. **Tables fitted to your project.** `cn build` regenerates the tables from
   your project's actual classes and drops the rest. The incumbents can't:
   their config object _is_ their public API and has to ship whole.

Subsetting is safe because a class's group is, by definition, the _first_
group that matches it — removing groups nothing in your code ever matched
can't change a winner. In-project classes get byte-identical output; unknown
classes pass through unmerged. Same contract as Tailwind's own content
scanning.

## Parity

Same output as tailwind-merge, for every input, enforced in CI on every
commit: 56,346 differential cases, 300,000 grammar-fuzzed class strings,
5,054 custom-config cases against `extendTailwindMerge`, CLI end-to-end
tests with per-build subset parity, and idempotence and cached/uncached
agreement checks.

## Benchmark methodology

`npm run bench` runs every implementation × workload pair in its own child
process, with its own warmup, and keeps the best of 5 timed blocks.
Shared-process harnesses let warmup pollution, GC pressure, and V8 tiering
leak between implementations — we measured 5× swings from run ordering
alone.

Two honest caveats: microbenchmark nanoseconds wobble a few percent run to
run, and the "cold" workloads are synthetic worst cases — real renders are
dominated by the cache-hit rows, and even the cold rows are microseconds per
render pass.

## Size

The default entry is ~10.5 KB min+gzip: ~5.4 KB of compiled tables and
~5.1 KB of engine. Against clsx + tailwind-merge (~8.6 KB), that's ~1.9 KB
more on the wire and slightly less to parse (26.2 vs 27.4 KB minified). Our
data is smaller than their config; our engine is bigger because the
validators, trie, and conflict machinery are real code instead of regex and
`Map` calls. That trade is the speed. If wire size matters more to you,
`cn build` fits the tables to your project. CI gates the entry against a
fixed budget — past size experiments and their measured outcomes are logged
in [size.mjs](../packages/conformance/scripts/size.mjs).

## Credits

See [Credits](../README.md#credits).
