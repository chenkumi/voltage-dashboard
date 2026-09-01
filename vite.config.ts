import { cloudflare } from "@cloudflare/vite-plugin"
import { sites } from "@openai/sites-vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      sites(),
      cloudflare({ viteEnvironment: { name: "server" } }),
    ],
    server: {
      open: true,
      port: 6171,
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  }
})
