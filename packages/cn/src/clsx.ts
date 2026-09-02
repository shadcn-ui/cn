// Full clsx-compatible join without a Tailwind table. Keep this as a separate
// entry so aliases for libraries such as CVA do not pull in the default table
// when an application uses project-built tables from `cn/engine`.
export { clsx as default, clsx } from "./engine.js"
