import { rm } from "node:fs/promises";

// Nitro genera un puntero para desplegar su bundle SSR. Esta aplicación se
// publica como SPA estática, así que Wrangler debe respetar wrangler.jsonc.
await rm(".wrangler/deploy/config.json", { force: true });
