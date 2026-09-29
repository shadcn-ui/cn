import { defineConfig } from "vite-plus"

export default defineConfig({
  lint: {
    plugins: ["typescript"],
    categories: {
      correctness: "error",
    },
    env: {
      builtin: true,
      node: true,
    },
    ignorePatterns: [
      "**/dist/",
      "**/node_modules/",
      "**/*.generated.ts",
      ".research/",
      ".plans/",
      ".claude/",
      ".deepsec/",
    ],
    rules: {
      "no-case-declarations": "error",
      "no-empty": "error",
      "no-fallthrough": "error",
      "no-prototype-builtins": "error",
      "no-redeclare": "error",
      "no-regex-spaces": "error",
      "no-undef": "error",
      "no-unexpected-multiline": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-useless-assignment": "error",
      "preserve-caught-error": "error",
      // Oxfmt sorts declarations and Oxlint handles named import members.
      "sort-imports": [
        "error",
        { ignoreCase: true, ignoreDeclarationSort: true },
      ],
      "typescript/ban-ts-comment": "error",
      "typescript/no-array-constructor": "error",
      "typescript/no-empty-object-type": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-namespace": "error",
      "typescript/no-require-imports": "error",
      "typescript/no-unnecessary-type-constraint": "error",
      "typescript/no-unsafe-function-type": "error",
    },
    overrides: [
      {
        // Import order in engine sources affects the size budget.
        files: ["packages/cn/src/**/*.ts"],
        rules: {
          "sort-imports": "off",
        },
      },
    ],
  },
  fmt: {
    endOfLine: "lf",
    semi: false,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "es5",
    printWidth: 80,
    sortImports: {
      customGroups: [
        { groupName: "at-imports", elementNamePattern: ["@/**", "@*/**"] },
      ],
      groups: [
        "builtin",
        { newlinesBetween: false },
        "at-imports",
        { newlinesBetween: false },
        ["external", "internal", "subpath"],
        { newlinesBetween: true },
        ["parent", "sibling", "index"],
        "unknown",
      ],
    },
    sortPackageJson: false,
    ignorePatterns: [
      "node_modules/",
      "dist/",
      "pnpm-lock.yaml",
      "*.generated.ts",
      "CHANGELOG.md",
      ".research/",
      ".plans/",
      ".claude/",
      ".deepsec/",
    ],
    overrides: [
      {
        files: ["packages/cn/src/**/*.ts"],
        options: {
          sortImports: false,
        },
      },
    ],
  },
})
