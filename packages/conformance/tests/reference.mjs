// Independent upstream engine with the documented cn grammar additions.
// Keep this separate from the vendoring implementation so parity catches drift.
import { extendTailwindMerge, fromTheme, validators } from "tailwind-merge"

export const ref = extendTailwindMerge({
  override: {
    theme: { animate: [validators.isAny] },
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
      "bg-image": [
        { "bg-gradient-to": ["t", "tr", "r", "br", "b", "bl", "l", "tl"] },
        "bg-conic",
      ],
      columns: ["columns-auto"],
      "max-h": ["max-h-none"],
      shadow: ["shadow-inner"],
      "inline-size": [{ inline: [fromTheme("container")] }],
      "min-inline-size": [{ "min-inline": [fromTheme("container")] }],
      "max-inline-size": [{ "max-inline": [fromTheme("container")] }],
      "auto-cols": [{ "auto-cols": [fromTheme("spacing")] }],
      "auto-rows": [{ "auto-rows": [fromTheme("spacing")] }],
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
