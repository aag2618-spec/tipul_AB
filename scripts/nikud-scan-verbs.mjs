// סריקת פעלי גוף-שני-עבר (X־תָ) שנקדן עלול לבלבל עם צורת segolate (X־ֶת)
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('nikud-work/dict.json', 'utf8'));
const splitTokens = (s) => s.match(/[֑-ׇא-ת]+|[^֑-ׇא-ת]+/gu) || [];
const isHebWord = (t) => /[א-ת]/.test(t);
const strip = (s) => s.replace(/[֑-ׇ]/g, '');
// פעלים נפוצים בדפי עבודה ("אחרי ש___ ונשמת")
const targets = ['עצרת', 'נשמת', 'הפסקת', 'ניסית', 'הצלחת', 'בחרת', 'הרגשת', 'חשבת', 'ראית', 'אמרת', 'שמת', 'עשית', 'למדת', 'החלטת', 'ויתרת', 'הבחנת', 'גילית', 'הבנת', 'זיהית', 'הסכמת'];
const counts = {};
for (const nik of Object.values(d)) {
  for (const w of splitTokens(nik).filter(isHebWord)) {
    const base = strip(w);
    if (targets.includes(base)) { (counts[base] ??= {}); counts[base][w] = (counts[base][w] || 0) + 1; }
  }
}
for (const t of targets) {
  if (!counts[t]) continue;
  console.log(t + ':');
  for (const [form, c] of Object.entries(counts[t]).sort((a, b) => b[1] - a[1])) console.log('   ' + form + '  ×' + c);
}
