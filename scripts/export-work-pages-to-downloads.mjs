import { cp, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

const src = path.join(root, "src", "app", "(dashboard)");
const folderName = "mytipul-work-pages-export";
const dest = path.join(resolveDownloadsDir(), folderName);

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });

const readme = `MyTipul — ייצוא דפי העבודה (קוד מקור)
============================================

מה זה?
--------
תיקייה זו הועתקה אוטומטית מפרויקט MyTipul מתוך:
  src/app/(dashboard)

זהו קוד Next.js (קבצי TSX) — לא "אתר מוכן לפתיחה בדפדפן".
כדי לראות את המסכים בפועל צריך את כל הפרויקט, משתני סביבה (.env) והרצה:
  npm install
  npm run dev
ואז בדפדפן: http://localhost:3000/dashboard

תאריך ייצוא: ${new Date().toISOString()}
`;

await writeFile(path.join(dest, "README-EXPORT.txt"), readme, "utf8");

console.log("");
console.log("הועתקו דפי העבודה (כל תיקיית ה-dashboard) ל:");
console.log(dest);
console.log("");
console.log("פתח את התיקייה הזו בסייר הקבצים — שם כל קבצי הדפים.");
console.log("");
