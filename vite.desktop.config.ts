import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Compilación puramente cliente para Cloudflare y Electron. Evita ejecutar el
// prerender SSR de TanStack Start: todas las herramientas trabajan en local.
export default defineConfig({
  root: "desktop",
  publicDir: "../public",
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1800,
  },
});
