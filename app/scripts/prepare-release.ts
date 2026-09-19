import {copyFile, writeFile} from "node:fs/promises"
// Preload before Nitro dynamically imports SSR chunks that use WebAuthn/tsyringe.
await copyFile(import.meta.resolve("reflect-metadata").replace(/^file:\/\//, ""), ".output/reflect.cjs")
await writeFile(".output/start.mjs", 'import "./reflect.cjs";\nawait import("./server/index.mjs");\n')
