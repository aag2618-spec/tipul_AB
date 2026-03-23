import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const FILENAME = "mytipul-work-demo-cbt.html";

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
  return path.join(userProfile, "Downloads");
}

const logoPath = path.join(root, "public", "logo.png");
const templatePath = path.join(root, "public", "work-demo-cbt.html");

const [logoBuf, template] = await Promise.all([
  readFile(logoPath),
  readFile(templatePath, "utf8"),
]);

const dataUrl = `data:image/png;base64,${logoBuf.toString("base64")}`;
const html = template.replaceAll("__LOGO_DATA_URL__", dataUrl);

const outPath = path.join(resolveDownloadsDir(), FILENAME);
await writeFile(outPath, html, "utf8");

console.log("");
console.log("נשמר דמו דף עבודה (CBT):");
console.log(outPath);
console.log("");
