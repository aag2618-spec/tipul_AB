// מייצר PDF מושלם מכל דף עבודה — פוטר "כל הזכויות שמורות" + קישור בכל עמוד,
// שוליים קבועים, ללא תלות בהגדרות ההדפסה של המשתמש.
//
// הפוטר מוטמע ע"י מנוע ה-PDF של Chrome (footerTemplate) — לא CSS שנשבר בהדפסת דפדפן.
//
// שימוש:
//   node scripts/generate-worksheet-pdfs.mjs               → כל הדפים → Downloads
//   node scripts/generate-worksheet-pdfs.mjs act-cognitive-defusion-mytipul   → דף אחד → Downloads
//   node scripts/generate-worksheet-pdfs.mjs all public    → כל הדפים → public/worksheets/pdf/

import puppeteer from "puppeteer-core";
import { readFile, readdir, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const wsDir = path.join(root, "public", "worksheets");

// --- מציאת Chrome מותקן ---
const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chrome = CHROME_CANDIDATES.find(existsSync);
if (!chrome) {
  console.error("לא נמצא Chrome/Edge מותקן. עדכן את CHROME_CANDIDATES.");
  process.exit(1);
}

// --- פוטר: מופיע בכל עמוד, מרונדר ע"י מנוע ה-PDF (לא CSS) ---
// השם עטוף כקישור לחיץ לאתר.
const FOOTER = `<div style="font-size:8.5px; width:100%; text-align:center; direction:rtl;
  font-family:'Segoe UI',Arial,sans-serif; color:#334155; padding:0 10mm; margin:0;">
  © MyTipul — כל הזכויות שמורות &nbsp;&middot;&nbsp;
  <a href="https://mytipul.com" style="color:#ea580c; text-decoration:none;">mytipul.com</a>
</div>`;

// מבטל רק את ה-.footer הרגיל (שמופיע פעם בסוף כל חלק). משאיר את ה-@page margin
// וה-.sheet כפי שמוגדרים ב-@media print של ה-HTML (שוליים אמיתיים 10mm + buffer) —
// כדי שה-PDF לא יהיה full-bleed (שגורם לכרום להזיז בהדפסה). ה-.print-footer (position:fixed)
// נשאר → פוטר לחיץ בכל עמוד.
// מסיר את ה-buffer האופקי (8mm) שנחוץ רק להדפסת דפדפן — ב-PDF נשארים שולי ה-@page (10mm)
// שמספיקים. כך הדף לא full-bleed (ממורכז עם שוליים) אך גם לא צר מדי.
const RESET_CSS = `
  .footer { display: none !important; }
  .sheet { padding-left: 0 !important; padding-right: 0 !important; }
`;

function resolveDownloadsDir() {
  const userProfile = process.env.USERPROFILE || homedir();
  for (const dir of [
    path.join(userProfile, "Downloads"),
    path.join(homedir(), "Downloads"),
    path.join(userProfile, "הורדות"),
  ]) {
    if (existsSync(dir)) return dir;
  }
  return path.join(userProfile, "Downloads");
}

// --- ארגומנטים ---
const arg1 = process.argv[2] || "all";
const arg2 = process.argv[3] || "downloads";

let outDir;
if (arg2 === "public") {
  outDir = path.join(wsDir, "pdf");
  await mkdir(outDir, { recursive: true });
} else {
  outDir = resolveDownloadsDir();
}

let files;
if (arg1 === "all") {
  files = (await readdir(wsDir)).filter((f) => f.endsWith("-mytipul.html"));
} else {
  files = [arg1.endsWith(".html") ? arg1 : `${arg1}.html`];
}

console.log(`\nמייצר ${files.length} קבצי PDF → ${outDir}\n`);

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

for (const file of files) {
  const srcPath = path.join(wsDir, file);
  if (!existsSync(srcPath)) {
    console.error(`  ✗ לא נמצא: ${file}`);
    continue;
  }
  const html = await readFile(srcPath, "utf8");
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
  await page.addStyleTag({ content: RESET_CSS });
  // לוודא שהפונט (Heebo) נטען לפני ההמרה
  await page.evaluate(() => document.fonts.ready);

  const outPath = path.join(outDir, file.replace(/\.html$/, ".pdf"));
  await page.pdf({
    path: outPath,
    printBackground: true,
    // ללא footerTemplate — Chrome לא שומר בו קישורים לחיצים.
    // הפוטר מגיע מ-.print-footer (position:fixed) של ה-HTML — מופיע בכל עמוד והקישור נשמר.
    displayHeaderFooter: false,
    // משתמש ב-@page (size A4 + margins 8mm 10mm 18mm) של ה-HTML — שוליים אמיתיים,
    // לא full-bleed. מונע הזזה כשמדפיסים את ה-PDF דרך הדפדפן.
    preferCSSPageSize: true,
  });
  await page.close();
  console.log(`  ✓ ${path.basename(outPath)}`);
}

await browser.close();
console.log(`\nהושלם. ${files.length} קבצים נשמרו ב:\n${outDir}\n`);
