/**
 * מייצר את קובצי האייקון של ה-PWA / favicon מתוך קובצי ה-SVG המקוריים.
 *
 * מקור: public/icon.svg (any/apple/favicon) ו-public/icon-maskable.svg (maskable, עם padding).
 * הרצה מתיקיית השורש של הפרויקט:  node scripts/generate-app-icons.mjs
 *
 * הערה: sharp לא מייצר .ico — ה-favicon הווקטורי (icon.svg) + favicon-32.png מספיקים לדפדפן מודרני.
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icon.svg");
const mask = readFileSync("public/icon-maskable.svg");

const png = (buf, size, name) =>
  sharp(buf, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(`public/${name}`)
    .then(() => console.log(`  ✓ ${name} (${size}×${size})`));

await Promise.all([
  png(svg, 192, "icon-192.png"),
  png(svg, 512, "icon-512.png"),
  png(svg, 180, "apple-touch-icon.png"),
  png(svg, 32, "favicon-32.png"),
  png(mask, 512, "icon-maskable-512.png"),
]);

console.log("✓ app icons generated");
