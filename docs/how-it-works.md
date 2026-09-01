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
worst cases — real renders are dominated by the cache-hit rows. The
real-repository replays below are the closest thing to a production
workload, and there cnfast 0.2.0 is currently ~1.07× faster (geometric
mean) while cn wins the largest corpus. Both are microseconds per render
pass either way.

## Real-repository replays

`pnpm bench:corpus` replays every `cn()` call harvested from 58 open source
codebases (`packages/conformance/bench/corpora`, collected by cnfast's bench
suite; sources listed in `corpora/repos.json`). One replay walks a
repository's calls in order, the way render loops do, so recurring calls
reward caches and the long tail of one-off strings exercises the merge
engine. Each (library × repository) pair runs in its own process with its own
warmup, best of 5 timed blocks. Before timing, every call is merged by all
three libraries in one process and output mismatches against the pair are
counted, so a speed number never hides a parity break (none on this corpus).

ns per call; bold marks the fastest library on each row. Geometric mean over
the 58 repositories: cn 38.0× vs the pair, 0.93× vs cnfast (cnfast 40.7× vs
the pair). cn is faster than cnfast on 6 of 58; worst row social-app at
0.76×.

| repository       |  calls | clsx + tailwind-merge |      cnfast |          cn | vs pair | vs cnfast |
| ---------------- | -----: | --------------------: | ----------: | ----------: | ------: | --------: |
| posthog          | 18,352 |               1.29 µs |     57.4 ns | **17.8 ns** |  72.58× |     3.22× |
| supabase         | 12,225 |               1.57 µs | **18.2 ns** |     20.2 ns |  77.83× |     0.90× |
| dub              |  6,863 |               1.81 µs | **15.2 ns** |     15.8 ns | 114.46× |     0.96× |
| cap              |  5,705 |               1.97 µs |     20.9 ns | **19.3 ns** | 101.83× |     1.08× |
| omi              |  5,072 |               1.74 µs | **17.0 ns** |     17.5 ns |  99.57× |     0.97× |
| infisical        |  5,021 |               1.51 µs | **13.3 ns** |     14.6 ns | 103.51× |     0.91× |
| mastra           |  4,868 |               1.63 µs | **15.9 ns** |     17.2 ns |  94.83× |     0.93× |
| plane            |  4,617 |               1.69 µs | **12.8 ns** |     13.9 ns | 121.12× |     0.91× |
| midday           |  4,058 |               1.58 µs |     14.9 ns | **13.8 ns** | 114.12× |     1.08× |
| langfuse         |  3,955 |               1.47 µs | **15.0 ns** |     16.3 ns |  90.30× |     0.92× |
| huly             |  3,659 |              593.4 ns | **13.8 ns** |     15.1 ns |  39.41× |     0.91× |
| teable           |  3,605 |               1.45 µs | **14.6 ns** |     15.7 ns |  92.33× |     0.93× |
| cal-diy          |  3,491 |               1.74 µs | **15.3 ns** |     16.5 ns | 105.22× |     0.93× |
| calcom           |  3,491 |               1.82 µs | **14.7 ns** |     16.0 ns | 113.67× |     0.92× |
| shadcn-ui        |  3,265 |               1.68 µs | **11.4 ns** |     13.0 ns | 128.97× |     0.87× |
| open-webui       |  3,241 |               1.59 µs | **13.8 ns** |     14.7 ns | 108.14× |     0.94× |
| formbricks       |  3,085 |               1.58 µs | **14.4 ns** |     15.4 ns | 102.27× |     0.93× |
| unkey            |  3,059 |               1.75 µs |     14.5 ns | **12.7 ns** | 138.13× |     1.14× |
| trigger-dev      |  2,888 |               1.45 µs | **16.4 ns** |     17.9 ns |  80.98× |     0.91× |
| dyad             |  2,832 |               2.03 µs | **16.4 ns** |     17.4 ns | 116.52× |     0.94× |
| medusa           |  2,781 |               1.59 µs |     16.4 ns | **14.6 ns** | 108.77× |     1.12× |
| inbox-zero       |  2,663 |               1.56 µs | **11.9 ns** |     14.0 ns | 111.44× |     0.85× |
| openreplay       |  2,533 |               1.05 µs | **15.1 ns** |     16.7 ns |  63.04× |     0.90× |
| onlook           |  2,332 |               1.82 µs | **14.9 ns** |     16.8 ns | 108.09× |     0.88× |
| note-gen         |  2,288 |               1.71 µs | **14.5 ns** |     16.0 ns | 107.22× |     0.91× |
| documenso        |  2,254 |               1.56 µs | **14.6 ns** |     15.9 ns |  98.08× |     0.92× |
| insomnia         |  2,191 |               1.83 µs | **13.9 ns** |     15.6 ns | 117.31× |     0.89× |
| better-auth      |  1,833 |               1.86 µs |     14.2 ns | **13.1 ns** | 142.20× |     1.08× |
| executor         |  1,695 |               1.70 µs | **13.9 ns** |     14.7 ns | 115.79× |     0.94× |
| karakeep         |  1,607 |               1.34 µs | **13.4 ns** |     14.4 ns |  93.12× |     0.93× |
| openstatus       |  1,539 |               1.58 µs | **11.2 ns** |     12.4 ns | 127.92× |     0.90× |
| payload          |  1,427 |              762.5 ns | **14.2 ns** |     16.2 ns |  47.09× |     0.88× |
| tinacms          |  1,426 |               2.09 µs | **15.0 ns** |     16.2 ns | 128.41× |     0.92× |
| postiz-app       |  1,413 |               1.64 µs | **13.1 ns** |     15.7 ns | 104.88× |     0.83× |
| typebot-io       |  1,330 |               1.64 µs | **14.6 ns** |     16.0 ns | 102.92× |     0.91× |
| reactive-resume  |  1,211 |               1.85 µs | **13.9 ns** |     15.2 ns | 121.33× |     0.92× |
| nx               |  1,178 |               1.70 µs | **13.7 ns** |     15.9 ns | 106.88× |     0.86× |
| memos            |  1,115 |               1.62 µs | **11.1 ns** |     12.6 ns | 128.16× |     0.87× |
| linkwarden       |  1,047 |               1.24 µs | **13.7 ns** |     15.2 ns |  81.51× |     0.90× |
| chartdb          |    895 |               1.46 µs | **14.5 ns** |     15.2 ns |  95.88× |     0.96× |
| pierre           |    788 |              990.2 ns | **10.5 ns** |     12.1 ns |  81.91× |     0.87× |
| affine           |    690 |              612.2 ns | **13.3 ns** |     15.6 ns |  39.16× |     0.85× |
| nuxt-ui          |    649 |              313.6 ns | **12.8 ns** |     15.8 ns |  19.86× |     0.81× |
| react-grab       |    528 |              160.3 ns | **13.0 ns** |     14.3 ns |  11.21× |     0.91× |
| drawdb           |    446 |               27.7 ns | **12.0 ns** |     13.4 ns |   2.07× |     0.90× |
| react-scan       |    402 |               57.9 ns | **12.9 ns** |     15.6 ns |   3.72× |     0.83× |
| taxonomy         |    392 |               45.9 ns |  **9.9 ns** |     11.4 ns |   4.02× |     0.86× |
| fastgpt          |    389 |               32.6 ns | **12.4 ns** |     13.6 ns |   2.39× |     0.91× |
| responsively-app |    344 |               27.4 ns | **13.3 ns** |     14.5 ns |   1.89× |     0.92× |
| create-t3-app    |    311 |               47.8 ns | **13.0 ns** |     15.5 ns |   3.09× |     0.84× |
| expect           |    288 |               58.3 ns | **12.8 ns** |     14.9 ns |   3.91× |     0.86× |
| nodejs-org       |    213 |               18.5 ns |  **9.3 ns** |      9.9 ns |   1.87× |     0.93× |
| commerce         |    170 |               35.5 ns |  **9.9 ns** |     10.9 ns |   3.24× |     0.90× |
| open-assistant   |    165 |               18.7 ns | **12.9 ns** |     13.5 ns |   1.39× |     0.96× |
| starlight        |    129 |               18.0 ns |  **9.1 ns** |     10.7 ns |   1.68× |     0.85× |
| social-app       |    126 |               20.6 ns |  **8.6 ns** |     11.3 ns |   1.83× |     0.76× |
| novel            |    113 |               34.5 ns | **11.2 ns** |     13.4 ns |   2.57× |     0.84× |
| bippy            |     12 |               57.6 ns | **10.6 ns** |     11.9 ns |   4.85× |     0.89× |

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
