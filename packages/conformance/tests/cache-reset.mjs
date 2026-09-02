import { cn } from "cn"
import { createCn as createConfiguredCn } from "cn/config"
import { createCn, createEngine } from "cn/engine"
import tables from "cn/tables"

let pass = 0
let fail = 0
const expect = (name, condition) => {
  if (condition) pass++
  else {
    fail++
    console.error("FAIL:", name)
  }
}

const engine = createEngine(tables)
expect("engine exposes clearCache", typeof engine.clearCache === "function")
expect("first sighting", engine.seenBefore("p-2 p-4") === false)
expect("second sighting", engine.seenBefore("p-2 p-4") === true)
engine.clearCache()
expect("doorkeeper reset", engine.seenBefore("p-2 p-4") === false)

const bound = createCn(tables)
expect("bound cn exposes clearCache", typeof bound.clearCache === "function")
expect("bound result before reset", bound("p-2", "p-4") === "p-4")
bound("p-2", "p-4")
bound(Array.from({ length: 1_024 }, (_, i) => `p-[${i}px]`).join(" "))
bound.clearCache()
expect("bound result after reset", bound("p-2", "p-4") === "p-4")

expect("default cn exposes clearCache", typeof cn.clearCache === "function")
cn("hover:p-2", "hover:p-4")
cn.clearCache()
expect(
  "default result after reset",
  cn("hover:p-2", "hover:p-4") === "hover:p-4"
)

const configured = createConfiguredCn({
  extend: { classGroups: { display: ["custom-display"] } },
})
expect(
  "configured cn exposes clearCache",
  typeof configured.clearCache === "function"
)
configured.clearCache()
expect(
  "clear before lazy compile",
  configured("block custom-display") === "custom-display"
)
configured.clearCache()
expect(
  "configured result after reset",
  configured("custom-display block") === "block"
)

console.log(`cache-reset: pass ${pass}  fail ${fail}`)
if (fail) process.exit(1)
