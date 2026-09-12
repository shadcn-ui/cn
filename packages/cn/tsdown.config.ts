import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    engine: "src/engine.ts",
    types: "src/types.ts",
    tables: "src/tables.generated.ts",
    config: "src/config.ts",
    compiler: "src/compiler.ts",
    build: "src/build.ts",
    vite: "src/vite.ts",
    next: "src/next.ts",
    lite: "src/lite.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  hash: false,
  target: "es2022",
  minify: false,
  clean: true,
})
