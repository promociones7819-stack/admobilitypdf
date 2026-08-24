import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRotation } from "../src/lib/pdf/types.ts";
import { pageChunks, parsePageGroups, parsePageRange } from "../src/lib/pdf/ranges.ts";
import { normalizeConfig, safeExternalUrl } from "../src/lib/flipbook/hotspots.ts";

test("interpreta rangos de páginas y elimina duplicados", () => {
  assert.deepEqual(parsePageRange("1-3, 3, 6, 8-7", 8), [0, 1, 2, 5, 7, 6]);
  assert.throws(() => parsePageRange("1-12", 8), /range-outside/);
  assert.throws(() => parsePageRange("dos", 8), /invalid-range/);
});

test("divide páginas por grupos y por tamaño", () => {
  assert.deepEqual(parsePageGroups("1-2; 3,5; 4", 5), [[0, 1], [2, 4], [3]]);
  assert.deepEqual(pageChunks(7, 3), [[0, 1, 2], [3, 4, 5], [6]]);
});

test("normaliza rotaciones negativas y superiores a una vuelta", () => {
  assert.equal(normalizeRotation(-90), 270);
  assert.equal(normalizeRotation(450), 90);
});

test("rechaza esquemas inseguros en hipervínculos", () => {
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("ejemplo.com"), "https://ejemplo.com/");
});

test("descarta hotspots inválidos al importar configuración", () => {
  const result = normalizeConfig({
    version: 1,
    menuPage: -2,
    hotspots: [
      { page: 1, x: 2, y: 3, width: 20, height: 10, action: { type: "page", targetPage: 4 } },
      { page: 2, action: { type: "url", url: 23 } },
    ],
  });
  assert.equal(result.menuPage, 1);
  assert.equal(result.hotspots.length, 1);
  assert.equal(result.hotspots[0]?.action.type, "page");
});
