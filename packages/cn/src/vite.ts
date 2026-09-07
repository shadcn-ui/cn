// Vite plugin: generate project-fitted tables before the first module
// resolves, and keep them fresh in dev. The generated file is a normal
// module, so writing it is what triggers HMR for the code that imports it.
import { createBuilder } from "./build"

export const cn = (options: Parameters<typeof createBuilder>[0] = {}) => {
  let builder: ReturnType<typeof createBuilder> | null = null
  return {
    name: "cn:build",
    configResolved(config: { root: string }) {
      builder = createBuilder({ cwd: config.root, ...options })
    },
    async buildStart() {
      builder ??= createBuilder(options)
      await builder.run()
    },
    async watchChange(id: string, change: { event: string }) {
      if (change.event === "delete" || !builder) return
      await builder.changed(id)
    },
  }
}
