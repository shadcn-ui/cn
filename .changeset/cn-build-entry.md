---
"cn": minor
---

Add `cn/build`, the library behind `cn build`. The CLI now parses arguments and prints; scanning, subsetting, compiling, and writing run in `build(options)` so build scripts and bundler plugins can call it directly.
