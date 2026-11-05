// Compresses the avatar portraits (1254×1254 PNGs from the delivered zip, numbered -1 … -8
// at the end of the file name) into the app bundle: mobile/assets/avatars/fairy-<n>.webp, 256×256.
//
//   node scripts/compress-avatars.mjs <folder with the unzipped PNGs>
//
// Uses sharp from the root node_modules. Re-run after the artwork changes.
import { createRequire } from "node:module";
import { mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LEGACY_AVATAR_IDS as AVATAR_IDS } from "../lib/avatars.js";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const sharp = createRequire(root + "/package.json")("sharp");
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/compress-avatars.mjs <artwork folder>");
const out = root + "/mobile/assets/avatars";
mkdirSync(out, { recursive: true });

const files = readdirSync(source).filter(name => name.endsWith(".png"));
let bytes = 0;
for (const id of AVATAR_IDS) {
  const n = id.slice("fairy-".length);
  const file = files.find(name => name.endsWith(`-${n}.png`));
  if (!file) throw new Error(`Missing artwork for ${id} (a PNG ending in -${n}.png)`);
  const info = await sharp(`${source}/${file}`).resize(256, 256).webp({ quality: 82, effort: 6 }).toFile(`${out}/${id}.webp`);
  bytes += info.size;
}
console.log(`${AVATAR_IDS.length} avatars, ${(bytes / 1024).toFixed(0)} KB`);
