import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    engine: "src/engine.ts",
    types: "src/types.ts",
    tables: "src/tables.generated.ts",
    config: "src/config.ts",
    compiler: "src/compiler.ts",
    lite: "src/lite.ts",
    cva: "src/cva.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  hash: false,
  target: "es2022",
  minify: false,
  clean: true,
})
