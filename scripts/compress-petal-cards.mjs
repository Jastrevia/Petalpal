// Compresses the owner's petal card artwork (1024×1536 PNGs from the delivered zip) into
// the app bundle: mobile/assets/petal-cards/<id>.webp, 600×900, all 78 cards
// (lib/petal-cards.js), the heavy ones too (the daily draw deals them).
//
//   node scripts/compress-petal-cards.mjs <folder with the unzipped PNGs>
//
// Uses sharp from the root node_modules. Re-run after the artwork changes.
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PETAL_CARDS } from "../lib/petal-cards.js";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const sharp = createRequire(root + "/package.json")("sharp");
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/compress-petal-cards.mjs <artwork folder>");
const out = root + "/mobile/assets/petal-cards";
mkdirSync(out, { recursive: true });

let bytes = 0;
for (const card of PETAL_CARDS) {
  const file = [`${source}/${card.art}.png`, `${source}/${card.art}`].find(existsSync);
  if (!file) throw new Error(`Missing artwork for ${card.id}: ${card.art}`);
  const info = await sharp(file).resize(600, 900, { fit: "fill" }).webp({ quality: 80, effort: 6 }).toFile(`${out}/${card.id}.webp`);
  bytes += info.size;
}
console.log(`${PETAL_CARDS.length} cards, ${(bytes / 1048576).toFixed(1)} MB`);
