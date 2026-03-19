import sharp from "sharp";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const input = join(root, "public", "logo.png");
const output = join(root, "public", "logo-transparent-preview.png");

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels } = info;

function px(x, y) {
  const i = (y * w + x) * channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

const samples = [
  px(0, 0),
  px(w - 1, 0),
  px(0, h - 1),
  px(w - 1, h - 1),
  px(Math.floor(w / 2), 0),
  px(0, Math.floor(h / 2)),
  px(w - 1, Math.floor(h / 2)),
  px(Math.floor(w / 2), h - 1),
];

let sumR = 0,
  sumG = 0,
  sumB = 0;
for (const p of samples) {
  sumR += p.r;
  sumG += p.g;
  sumB += p.b;
}
const n = samples.length;
const bgR = sumR / n;
const bgG = sumG / n;
const bgB = sumB / n;

/** Max RGB distance to sampled edge/background */
const DIST_THRESH = 52;
/** Also nuke bright low-chroma pixels (gradient center, off-white) */
const BRIGHT = 228;
const CHROMA_MAX = 28;

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dr = r - bgR;
    const dg = g - bgG;
    const db = b - bgB;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const chroma = mx - mn;
    const bright = (r + g + b) / 3;
    const nearSampled = dist < DIST_THRESH;
    const brightWash = bright >= BRIGHT && chroma <= CHROMA_MAX;
    if (nearSampled || brightWash) {
      data[i + 3] = 0;
    }
  }
}

await sharp(data, { raw: { width: w, height: h, channels: 4 } })
  .png()
  .toFile(output);

console.log("Wrote", output);
console.log("Sampled bg ~ RGB", Math.round(bgR), Math.round(bgG), Math.round(bgB), "thresh", DIST_THRESH);
