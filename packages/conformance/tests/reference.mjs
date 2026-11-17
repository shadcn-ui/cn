// Independent upstream engine with the documented cn grammar additions.
// Keep this separate from the vendoring implementation so parity catches drift.
import { extendTailwindMerge, fromTheme, validators } from "tailwind-merge"

// Tailwind v4 compiles an unlabeled `font-[…]` to font-family unless it starts
// with var(, is a number, calls a math function, or has a comma part starting
// with a digit.
const isFontName = (v) => {
  const parts = /^\[(?!\w[\w-]*:)(.+)\]$/.exec(v)?.[1].split(",") ?? []
  return (
    parts.some((p) => !p.startsWith("var(")) &&
    parts.every((p) => !/^\d/.test(p)) &&
    !/^var\(|^[+-]?\d*\.?\d+([eE][+-]?\d+)?$|(calc|min|max|clamp|mod|rem|sin|cos|tan|atan2|pow|sqrt|hypot|log|exp|round)\(/.test(
      parts.join(",")
    )
  )
}

export const ref = extendTailwindMerge({
  override: {
    classGroups: {
      "font-weight": [
        {
          font: [
            fromTheme("font-weight"),
            validators.isArbitraryVariableWeight,
            (v) => validators.isArbitraryWeight(v) && !isFontName(v),
          ],
        },
      ],
    },
  },
  extend: {
    classGroups: {
      contain: [
        {
          contain: [
            "none",
            "content",
            "strict",
            validators.isArbitraryVariable,
            validators.isArbitraryValue,
          ],
        },
      ],
      "contain-size": [{ contain: ["size", "inline-size"] }],
      "contain-layout": ["contain-layout"],
      "contain-paint": ["contain-paint"],
      "contain-style": ["contain-style"],
      "auto-cols": [{ "auto-cols": [fromTheme("spacing")] }],
      "auto-rows": [{ "auto-rows": [fromTheme("spacing")] }],
      "font-family": [{ font: [isFontName] }],
    },
    conflictingClassGroups: {
      contain: [
        "contain-size",
        "contain-layout",
        "contain-paint",
        "contain-style",
      ],
      "contain-size": ["contain"],
      "contain-layout": ["contain"],
      "contain-paint": ["contain"],
      "contain-style": ["contain"],
    },
  },
})
