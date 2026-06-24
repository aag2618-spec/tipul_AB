// מרכז דפי עבודה חדשים מתיקיית src/lib/worksheets-pages/ (קובץ לכל דף — כך אפשר
// לעבוד על דפים רבים במקביל בלי להתנגש) לתוך src/lib/worksheets-content-extra3.mjs.
//
// כל קובץ דף מייצא default object: { categoryId, approach, approachHe, categoryDescription,
//   categoryColor, slug, title, ... , therapist, sections, example, kids? }
// הסקריפט מקבץ דפים לקטגוריות לפי categoryId (קטגוריה קיימת בדף הקטלוג → מתמזגת אליה).
//
// שימוש:  node scripts/gen-extra-pages.mjs   (להריץ לפני build-worksheets.mjs)

import { readdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pagesDir = path.join(root, "src", "lib", "worksheets-pages");

let files = [];
try {
  files = (await readdir(pagesDir)).filter((f) => f.endsWith(".mjs")).sort();
} catch {
  /* התיקייה עדיין לא קיימת — נכתוב מערך ריק */
}
const slugs = files.map((f) => f.replace(/\.mjs$/, ""));

const importLines = slugs.map((s, i) => `import p${i} from "./worksheets-pages/${s}.mjs";`).join("\n");
const arrLine = `const pages = [${slugs.map((_, i) => `p${i}`).join(", ")}];`;

const out = `// ⚙️ AUTO-GENERATED ע"י scripts/gen-extra-pages.mjs — אל תערוך ידנית!
// מקור: src/lib/worksheets-pages/*.mjs (קובץ לכל דף). הרץ את הסקריפט מחדש כדי לרענן.
${importLines}
${arrLine}
const byId = {};
for (const p of pages) {
  const { categoryId, approach, approachHe, categoryDescription, categoryColor, ...ws } = p;
  if (!byId[categoryId]) {
    byId[categoryId] = { id: categoryId, approach, approachHe, description: categoryDescription, color: categoryColor, worksheets: [] };
  }
  byId[categoryId].worksheets.push(ws);
}
export const extraCategories3 = Object.values(byId);
`;

await writeFile(path.join(root, "src", "lib", "worksheets-content-extra3.mjs"), out, "utf8");
console.log(`gen-extra-pages: ${slugs.length} דפים → extraCategories3 (${slugs.join(", ") || "ריק"})`);
