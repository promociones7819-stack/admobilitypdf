import { defaultClientConditions, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Compilación puramente cliente para Cloudflare y Electron. Evita ejecutar el
// prerender SSR de TanStack Start: todas las herramientas trabajan en local.
export default defineConfig({
  root: "desktop",
  publicDir: "../public",
  resolve: {
    tsconfigPaths: true,
    // Transformers.js descarga ONNX Runtime desde su CDN. Seleccionar la
    // variante externa evita copiar al build el WASM WebGPU de 26,5 MiB, que
    // supera el límite de 25 MiB por recurso estático de Cloudflare.
    conditions: ["onnxruntime-web-use-extern-wasm", ...defaultClientConditions],
  },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1800,
  },
});
