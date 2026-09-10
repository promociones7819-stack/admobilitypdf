import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Nitro genera un puntero para desplegar su bundle SSR. Esta aplicación se
// publica como SPA estática, así que Wrangler debe respetar wrangler.jsonc.
await rm(".wrangler/deploy/config.json", { force: true });

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDirectory = path.join(projectRoot, "dist");
const distAssets = path.join(distDirectory, "assets");

// Transformers.js configura ONNX Runtime para descargar su motor desde CDN.
// Algunas versiones de Vite emiten además copias locales que no se usan; una
// de ellas supera el límite de 25 MiB por recurso estático de Cloudflare.
for (const fileName of await readdir(distAssets)) {
  if (/^ort-wasm-.*\.wasm$/i.test(fileName)) {
    await rm(path.join(distAssets, fileName), { force: true });
  }
}

const tesseractDirectory = path.join(distDirectory, "tesseract");
const tesseractCoreDirectory = path.join(tesseractDirectory, "core");
const tesseractLanguageDirectory = path.join(tesseractDirectory, "lang");
await mkdir(tesseractCoreDirectory, { recursive: true });
await mkdir(tesseractLanguageDirectory, { recursive: true });

await cp(
  path.join(projectRoot, "node_modules/tesseract.js/dist/worker.min.js"),
  path.join(tesseractDirectory, "worker.min.js"),
);

const sourceCoreDirectory = path.join(projectRoot, "node_modules/tesseract.js-core");
for (const fileName of await readdir(sourceCoreDirectory)) {
  if (fileName.endsWith(".wasm.js")) {
    await cp(path.join(sourceCoreDirectory, fileName), path.join(tesseractCoreDirectory, fileName));
  }
}

for (const language of ["spa", "eng", "cat", "fra", "deu", "ita", "por"]) {
  await cp(
    path.join(
      projectRoot,
      `node_modules/@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`,
    ),
    path.join(tesseractLanguageDirectory, `${language}.traineddata.gz`),
  );
}
