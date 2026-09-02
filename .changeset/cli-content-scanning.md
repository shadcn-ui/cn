---
"cn": patch
---

`cn build`: fix `--content` brace globs (`src/**/*.{ts,tsx}` failed to parse), scan explicitly named dot- and ignored directories, follow symlinks, keep long arbitrary-value candidates, warn about unreadable files, create the output directory, and report file errors with the `cn:` prefix.
