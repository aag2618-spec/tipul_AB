// החלת תיקוני-ציווי בטוחים על מילון הניקוד (טעויות הקשר חוזרות של נקדן)
import fs from 'node:fs';
const path = 'nikud-work/dict.json';
const d = JSON.parse(fs.readFileSync(path, 'utf8'));
const cp = (s) => [...s].map((c) => 'U+' + c.codePointAt(0).toString(16).padStart(4, '0')).join(' ');

// אימות: איך "הקף" ו"צייר" מנוקדים בפועל במילון
const vals = Object.values(d);
const findWord = (base) => {
  for (const nik of vals) {
    const words = nik.match(/[֑-ׇא-ת]+/gu) || [];
    const w = words.find((x) => x.replace(/[֑-ׇ]/g, '') === base);
    if (w) return w;
  }
  return null;
};
const hk = findWord('הקף');
const ts = findWord('צייר');
console.log('הקף במילון: ', hk, '|', hk ? cp(hk) : '-');
console.log('צייר במילון:', ts, '|', ts ? cp(ts) : '-');

// תיקונים בטוחים בהקשר דפי עבודה לילדים (סדר חשוב)
const fixes = [
  ['הֶקֵּף', 'הַקֵּף'],                         // "הקף בעיגול" — ציווי, לא היקף
  ['סַמָּן', 'סַמֵּן'],                         // "סמן" — ציווי, לא שם-עצם
  ['צַיָּר', 'צַיֵּר'],                         // "צייר!" — ציווי, לא צייר/painter
  ['צַיֵּר אוֹ כָּתוּב', 'צַיֵּר אוֹ כְּתֹב'],   // הצמד אחרי תיקון צייר
  ['צִיֵּר אוֹ כָּתוּב', 'צַיֵּר אוֹ כְּתֹב'],
  // פעלי גוף-שני-עבר שנקדן בלבל עם סמיכות (אומת: כל ההקשרים פועל)
  ['שֶׁעֲצֶרֶת', 'שֶׁעָצַרְתָּ'],               // "אחרי שעצרת"
  ['נִשְׁמַת', 'נָשַׁמְתָּ'],                   // "נשמת ושאלת"
  ['הַרְגָּשַׁת', 'הִרְגַּשְׁתָּ'],             // "איפה הרגשת"
  ['הַצַּלַּחַת', 'הִצְלַחְתָּ'],               // "אחרי שהצלחת"
];
console.log('\nמה שכתוב בקוד:');
for (const [f] of fixes) console.log('  ', f, '|', cp(f));

const NFC = (s) => s.normalize('NFC');
const counts = {};
for (const [orig, nik] of Object.entries(d)) {
  let v = NFC(nik); // נרמול ניקוד לסדר קנוני אחיד
  for (const [from, to] of fixes) {
    const f = NFC(from), t = NFC(to);
    if (v.includes(f)) { counts[from] = (counts[from] || 0) + (v.split(f).length - 1); v = v.split(f).join(t); }
  }
  d[orig] = v;
}
fs.writeFileSync(path, JSON.stringify(d), 'utf8');
console.log('\nתיקונים שהוחלו:');
for (const [f, t] of fixes) console.log('  ', f, '->', t, '(' + (counts[f] || 0) + ' מופעים)');
