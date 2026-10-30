import {defineConfig} from "vite"
import react from "@vitejs/plugin-react"
import tailwind from "@tailwindcss/vite"
import {fileURLToPath} from "node:url"
const path=(value:string)=>fileURLToPath(new URL(value,import.meta.url))
export default defineConfig({
 root:"reference",publicDir:"../public",
 resolve:{dedupe:["react","react-dom","@tanstack/react-router","d3","topojson-client","mapbox-gl"],alias:{
  "~/lib/mapbox-actions":path("./reference/mapbox-actions.ts"),
  "~/lib/site-check-view":path("../../self-hosted/app/src/lib/site-check-view.ts"),
  "~/lib/visitor-mode-preference":path("../../self-hosted/app/src/lib/visitor-mode-preference.ts"),
  "~":path("./src"),"@original":path("../../self-hosted/app/src"),
 }},
 plugins:[tailwind(),react(),{name:"read-only-reference",configureServer(server){
  server.middlewares.use((req,res,next)=>{
   if(req.url?.startsWith("/api/")&&req.method!=="GET"&&req.method!=="HEAD"){
    res.statusCode=405;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:"原版对照页只读，请在 Go 版设置中操作。"}));return
   }
   next()
  })
 }}],
 server:{host:"127.0.0.1",port:3314,fs:{allow:[path("../../self-hosted/app"),path(".")]},proxy:{"/api":{target:"http://127.0.0.1:3311",changeOrigin:true}}},
})
