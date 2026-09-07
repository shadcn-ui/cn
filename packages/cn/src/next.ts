// Next.js wrapper: next.config is evaluated once when `next dev` or
// `next build` starts, for webpack and Turbopack alike, so generating the
// tables there guarantees they exist before any module resolves.
import { watch } from "node:fs"
import { join } from "node:path"
import { createBuilder } from "./build"

export const withCn = <T extends object>(
  nextConfig:
    T | ((phase: string, context: unknown) => T | Promise<T>) = {} as T,
  options: Parameters<typeof createBuilder>[0] = {}
) => {
  return async (phase: string, context: unknown) => {
    const builder = createBuilder(options)
    await builder.run()
    if (phase === "phase-development-server") {
      const cwd = options.cwd ?? process.cwd()
      const report = (err: unknown) =>
        console.error(`cn: ${err instanceof Error ? err.message : err}`)
      // Recursive watching is native on macOS, Windows, and Linux from Node 20.
      // The builder ignores paths outside the content globs, so watching the
      // whole project is cheap.
      watch(cwd, { recursive: true, persistent: false }, (_event, filename) => {
        if (filename) builder.changed(join(cwd, filename)).catch(report)
      })
    }
    return typeof nextConfig === "function"
      ? nextConfig(phase, context)
      : nextConfig
  }
}
