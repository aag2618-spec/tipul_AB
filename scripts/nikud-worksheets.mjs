// כלי ניקוד לדפי עבודה (גרסת ילדים) — חילוץ טקסט לנקדן והחזרתו פנימה
// שימוש:
//   node scripts/nikud-worksheets.mjs extract <file.html> <out.txt>
//   node scripts/nikud-worksheets.mjs apply   <file.html> <nikud.txt>
//
// מה מחולץ: רק הטקסט שהילד קורא — מתוך kids-worksheet-section ו-kids-example-section.
// לא נוגעים בעמוד למטפל/הורה (kids-parent-section), בפוטר, בקישורים וב-QR.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const HEB = /[א-ת]/;            // יש בו לפחות אות עברית אחת
const NIKUD = /[֑-ׇ]/g;         // כל סימני הניקוד והטעמים
const stripNikud = (s) => s.replace(NIKUD, '');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// אזורים שלא מנקדים (טקסט מיתוג/קישורים), גם אם הם בתוך ה-section של הילד
const SKIP = '.footer,.cta-box,.print-footer,.header-logo,.cta-qr';

function extractNodes(file) {
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const SHOW_TEXT = dom.window.NodeFilter.SHOW_TEXT;
  const sections = [
    doc.querySelector('.kids-worksheet-section'),
    doc.querySelector('.kids-example-section'),
  ].filter(Boolean);

  const items = [];
  for (const sec of sections) {
    const walker = doc.createTreeWalker(sec, SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const t = norm(n.nodeValue || '');
      if (!t || !HEB.test(t)) continue;
      // דילוג אם הצומת בתוך אזור מוחרג
      let p = n.parentElement;
      let skip = false;
      while (p && p !== sec.parentElement) {
        if (p.matches && p.matches(SKIP)) { skip = true; break; }
        p = p.parentElement;
      }
      if (skip) continue;
      items.push(t);
    }
  }
  return items;
}

const [, , cmd, file, txt] = process.argv;

if (cmd === 'extract') {
  const items = extractNodes(file);
  const uniq = [...new Set(items)];
  fs.writeFileSync(txt, uniq.join('\n'), 'utf8');
  console.log(`חולצו ${items.length} קטעים (${uniq.length} ייחודיים) -> ${txt}`);
} else if (cmd === 'apply') {
  const niks = fs.readFileSync(txt, 'utf8').split('\n').map(norm).filter(Boolean);
  const origs = [...new Set(extractNodes(file))];

  // השוואה גסה לפי עיצורים בלבד (בלי ניקוד, בלי אמות קריאה, בלי פיסוק/אימוג'י/לועזית)
  const loose = (s) => stripNikud(s).replace(/[ואיה]/g, '').replace(/[^א-ת]/g, '');

  // שלב 1: התאמה מדויקת — נקדן ששמר על האותיות (הדרך החסינה ביותר, לא תלויה בסדר)
  const byClean = new Map();
  for (const line of niks) byClean.set(stripNikud(line), line);
  const map = new Map();
  for (const o of origs) {
    const nik = byClean.get(stripNikud(o));
    if (nik && nik !== o) map.set(o, nik);
  }
  const exactCount = map.size;

  // שלב 2: גיבוי לפי סדר השורות (אם נקדן שינה כתיב) — רק כשמספר השורות תואם, ועם אימות שורש
  let orderCount = 0;
  if (niks.length === origs.length) {
    for (let i = 0; i < origs.length; i++) {
      if (map.has(origs[i]) || niks[i] === origs[i]) continue;
      if (loose(origs[i]) === loose(niks[i])) { map.set(origs[i], niks[i]); orderCount++; }
    }
  }

  // דיווח על מה שלא הותאם
  let miss = 0;
  for (const o of origs) {
    if (!map.has(o) && !byClean.has(stripNikud(o))) { miss++; console.log('  ללא ניקוד:', o.slice(0, 45)); }
  }
  if (niks.length !== origs.length) {
    console.log(`  ⚠ מספר השורות שחזר (${niks.length}) שונה ממספר הקטעים (${origs.length}) — בדוק שנקדן לא פיצל/מיזג שורות.`);
  }

  // החלפה דרך placeholder ייחודי כדי למנוע התנגשות תת-מחרוזות (קצר בתוך ארוך)
  let html = fs.readFileSync(file, 'utf8');
  const startMarker = '<div class="kids-worksheet-section">';
  const si = html.indexOf(startMarker);
  if (si < 0) { console.error('לא נמצא kids-worksheet-section'); process.exit(1); }
  const head = html.slice(0, si);
  let body = html.slice(si);

  const pairs = [...map.entries()].filter(([o]) => body.includes(o)).sort((a, b) => b[0].length - a[0].length);
  pairs.forEach(([orig], i) => { body = body.split(orig).join('@@NK' + i + 'NK@@'); });
  pairs.forEach(([, nik], i) => { body = body.split('@@NK' + i + 'NK@@').join(nik); });

  fs.writeFileSync(file, head + body, 'utf8');
  console.log(`נוקדו ${pairs.length} קטעים (${exactCount} לפי אותיות, ${orderCount} לפי סדר), ${miss} ללא ניקוד.`);
} else {
  console.log('שימוש: extract <file.html> <out.txt>  |  apply <file.html> <nikud.txt>');
}
