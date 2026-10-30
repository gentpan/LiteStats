import { createRoot } from "react-dom/client"
import { RouterProvider } from "@tanstack/react-router"
import { getRouter } from "./router"
import "./styles/app.css"

const router=getRouter()
declare module "@tanstack/react-router" {interface Register {router:typeof router}}
createRoot(document.getElementById("root")!).render(<RouterProvider router={router}/> )
