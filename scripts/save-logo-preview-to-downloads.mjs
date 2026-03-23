import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const FILENAME = "mytipul-logo-preview.html";

function resolveDownloadsDir() {
  const userProfile = process.env.USERPROFILE || homedir();
  const candidates = [
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, "Downloads"),
    path.join(homedir(), "Downloads"),
    path.join(userProfile, "Downloads"),
    path.join(userProfile, "הורדות"),
    path.join(homedir(), "הורדות"),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  const fallback = path.join(userProfile, "Downloads");
  return fallback;
}

const logoPath = path.join(root, "public", "logo.png");
const htmlPath = path.join(root, "public", "dashboard-logo-preview.html");

const [logoBuf, htmlRaw] = await Promise.all([
  readFile(logoPath),
  readFile(htmlPath, "utf8"),
]);

const dataUrl = `data:image/png;base64,${logoBuf.toString("base64")}`;
const html = htmlRaw.replace(
  '<img src="logo.png" alt="MyTipul" width="1376" height="768" />',
  `<img src="${dataUrl}" alt="MyTipul" width="1376" height="768" />`
);

const offlineNote = `<div class="note">
          <strong>קובץ זה נוצר מהפרויקט</strong> — הלוגו מוטמע בתוך הקובץ (אין צורך ב־<code>logo.png</code> נפרד). פותחים בלחיצה כפולה.
        </div>`;

const htmlWithBanner = html.replace(
  '<main class="main">',
  `<main class="main">${offlineNote}`
);

const downloadsDir = resolveDownloadsDir();
const outPath = path.join(downloadsDir, FILENAME);

await writeFile(outPath, htmlWithBanner, "utf8");

console.log("");
console.log("נשמר בהצלחה:");
console.log(outPath);
console.log("");
console.log("חפש ב-File Explorer את הקובץ: mytipul-logo-preview.html");
console.log("");
