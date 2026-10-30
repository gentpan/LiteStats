import { defineConfig } from "vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import tailwind from "@tailwindcss/vite"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
  resolve: {alias: {"~": fileURLToPath(new URL("./src",import.meta.url))}},
  plugins: [tanstackRouter({target:"react",autoCodeSplitting:true}),tailwind(),react()],
  server:{proxy:{"/api":"http://127.0.0.1:3311"}},
  build:{outDir:"../internal/plost/web",emptyOutDir:true,assetsInlineLimit:0},
})
