# How cn works

This is the technical companion to the README — none of it is needed to use
the package.

## The architectural difference

tailwind-merge and cnfast (a fork of its engine) ship Tailwind's conflict
rules as a runtime JavaScript config object — ~380 class groups of literals,
theme references, and validator regexes — and interprets it on every uncached
call: split the token on `-`, walk a `Map` trie over the parts, run regex
validators against sliced substrings, track conflicts with string keys.

`cn` moves that interpretation to compile time. A compiler
([src/compiler.ts](../packages/cn/src/compiler.ts)) consumes the same config shape and
emits flat lookup tables ([src/tables.generated.ts](../packages/cn/src/tables.generated.ts)),
and the runtime ([src/engine.ts](../packages/cn/src/engine.ts)) is a single pass over the
input string:

- **scan** — one pass finds token boundaries and a full FNV hash of each
  token, fused into the scan loop (it reads every character anyway, so
  hashing rides along). All structural parsing is deferred to the memo-miss
  path, so repeated tokens cost almost nothing.
- **classify** — a token's base feeds a compiled radix automaton (a
  character-level trie with collapsed chains, stored as CSR typed arrays).
  Scale values lifted out of the trie live in per-node literal maps probed by
  span hash. Validators run as opcodes over `(input, start, end)` spans — no
  substring allocation, no regex on the hot path.
- **variants** — variant prefixes intern to dense integer context ids;
  canonicalization (alphabetical segment sort, important flag, postfix rules)
  runs once per unique prefix ever, then it's an integer compare.
- **conflicts** — no-variant claims stamp an epoch array indexed directly by
  group id; variant contexts and dynamic groups share an epoch-stamped hash
  set keyed (context, group). "Does an earlier class lose?" is one integer
  test. No string keys, no Sets, no allocation.
- **emit** — survivors are sliced from the input exactly once; a merge that
  drops nothing returns the input string itself.

Per token on the hot path, `cn` allocates nothing. The whole-string cache and
a 2-way set-associative token memo (second-chance eviction, so one-shot
arbitrary values can't thrash hot entries) cover the repeated-work regimes.
The whole-string cache (8192 entries, two generations) is doorkeeper-admitted:
a string enters only on its second sighting, tracked by a two-generation
filter keyed with an O(1) positional whole-string hash. Each filter slot
stores the full 32-bit hash (xor epoch), so a slot collision almost never
counts as a sighting; sightings survive generation rotation, so recurring
working sets larger than the filter still warm instead of starving.
One-shot streams — SSR rendering unique strings — cause no insert
churn, and large recurring working sets (thousands of distinct strings per
render pass) warm fully instead of thrashing a small LRU. Above it sits an
argument-identity cache (a concept pioneered by cnfast, reimplemented
engine-agnostically — see [Credits](../README.md#credits)): repeated `cn(base, variant, cond && x)`
calls whose truthy args are the same string instances pointer-compare their
way to the cached result. Each entry also remembers which entry followed it
last time, so a render loop's repeated call _sequence_ verifies by identity
and skips even the bucket lookup; a self-repeat probe covers the same call
site firing twice in a row, and two- and three-argument calls — the dominant
component shape — take an unrolled front over monomorphic entry fields with
no `arguments` object on the path. Emission slices contiguous runs of kept
tokens in one call, so results are flat strings rather than cons-chains.

The consequences fall out directly:

1. **Speed** — no config interpretation at runtime (the cold-path numbers).
2. **Instant init** — tailwind-merge builds its trie from the config on first
   call (~3.2 ms, cnfast ~4.3 ms); `cn` just fills typed arrays from packed
   strings (~0.4 ms).
3. **Project-fitted tables** — because tables are compiler output, they can be
   regenerated against a project's actual classes (`cn build`), which the
   incumbents structurally cannot do: their config object _is_ their public
   API and must ship whole.

## Why subsetting is sound

`cn build` classifies every token found in your sources against the full
config, keeps the class groups that matched, and deletes the rest. For any
in-corpus class the result is byte-identical to the full tables: a class's
group is by definition the _first_ thing that matches it during
classification, so removing groups that never matched any corpus class cannot
change any corpus class's winner. Out-of-corpus classes fail classification
and pass through unmerged — the same contract as Tailwind's content scanning,
where an unscanned class generates no CSS.

## Parity enforcement

Output equality with tailwind-merge is the contract, enforced in CI on every
commit against the built artifact:

- 56,346 differential cases (hand batteries for every tricky category,
  pairwise pools, conflict-trio permutations, seeded fuzz)
- 300,000 grammar-fuzzed class strings (variants, arbitrary values, important,
  postfix, negatives, junk)
- 5,054 custom-config differential cases vs `extendTailwindMerge` (extends,
  overrides, custom validators, prefixes)
- CLI end-to-end tests including per-build subset parity
- idempotence and cached/uncached agreement checks

## Benchmark methodology

`npm run bench` runs every (implementation × workload) pair in an **isolated
child process** with its own warmup and takes the best of 5 timed blocks.
Shared-process harnesses (as used by common bench libraries) let warmup
pollution, GC pressure, and V8 tiering cross-contaminate implementations — we
measured swings of 5× from ordering effects alone before isolating.

Two honest caveats to the numbers: microbenchmark nanoseconds vary a few
percent run to run (cn and cnfast 0.2.0 trade places on the warmest rows —
single-site component calls, short recurring strings, large recurring
working sets — from run to run), and the "cold" workloads are synthetic
worst cases — real renders are dominated by the cache-hit rows. On cnfast's
own whole-repository replay suite, cnfast 0.2.0 is currently ~1.1× faster
(geometric mean); cn wins the largest corpus. Both are microseconds per
render pass either way.

## Size accounting

Of the default entry's ~10.5 KB (min+gzip): compiled tables ≈ 5.4 KB, engine ≈
5.1 KB. Compare tailwind-merge: config object ≈ 7.2 KB, engine ≈ 1.3 KB. Our
data is smaller than theirs (the compiler dedupes and packs aggressively);
our engine is bigger because the span validators, automaton, and conflict
machinery are real code rather than regex/`Map` calls. That trade is the
speed. `packages/conformance/scripts/size.mjs` gates CI on the default entry staying smaller than
cnfast.

Size experiments we ran and their measured outcomes, so nobody re-runs them
blind (the metric is min+gzip — gzip is already near-optimal on the table
text, which kills most "clever" encodings):

- interned unique-tail pool + per-set id streams: **+700 B** (reverted)
- lexicographic set reordering for gzip locality: **+189 B** (reverted)
- span-scanning numeric validators to kill slices: **+144 B, no speed gain**
  — the token memo already absorbs repeat validation (reverted)
- unifying the twJoin/clsx join layers into one resolver: **−60 B** (kept)
- exporting tables as one default object instead of named exports: **−90 B**
  of bundler glue (kept)
- second-chance memo + adaptive cache logic: **+40 B** for the cold-path
  speed wins (kept; the adaptive off-window was later replaced by doorkeeper
  admission, which fixed its failure mode — off-windows blocked large
  recurring working sets from ever warming the cache)
- sequence-predicting arg cache + doorkeeper-admitted 4096-entry
  whole-string cache + run-slice emission: **+460 B** for 30× on the
  dominant component call, 49×/11.7× on the 53-repo corpus replay, and
  every-workload wins vs released cnfast (kept)
- fused FNV token hash + tagged doorkeeper + direct claim array: **−22 B**
  and 1.6×/1.3× on the cold workloads — but the single-generation tagged
  filter starved recurring working sets bigger than itself (6–15× slower on
  real-repo replays; caught by speedlab, not the row benches — hence the
  `workset` workload). Kept only with the two-generation filter below.
- two-generation doorkeeper + 8192-entry cache + arity fronts for the arg
  cache: **+206 B** for a reproducible 30× headline (10.4 ns predicted
  call), corpus replays restored, and best-yet cold rows (kept; gzip now
  ~7% over released cnfast while parse stays ~13% under — the 5% gzip band
  in the size gate became 8%)

## Prior art and credits

See [Credits](../README.md#credits).
