// `clsx/lite` parity entry (`cn/lite`): strings-only join, everything else
// ignored — so a bundler alias of `clsx` → `cn` also covers code importing
// the `/lite` subpath. Join-only by design: this stands in for clsx's role
// (joining), not cn's (merging).

import type { ClassValue } from "./types.js"

// Typed as ClassValue[] (not string[]) because clsx serves its main
// declarations for `/lite` too — a narrower signature here would reject
// code that type-checks against clsx.
export const clsx = function (): string {
  let str = ""
  for (let i = 0; i < arguments.length; i++) {
    const tmp = arguments[i]
    if (tmp && typeof tmp === "string") {
      if (str) str += " "
      str += tmp
    }
  }
  return str
} as (...inputs: ClassValue[]) => string

export default clsx
