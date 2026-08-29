import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import "katex/dist/katex.min.css"
import "./index.css"

import { ThemeProvider } from "@/app/theme"
import App from "./App"

const router = createBrowserRouter([{ path: "*", element: <App /> }])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>
)
