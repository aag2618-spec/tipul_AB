// ניקוד אוטומטי לדפי עבודה (גרסת ילדים) דרך API של נקדן (Dicta) + מיזוג ששומר על תווי המקור
// שימוש:
//   node scripts/nikud-auto.mjs build-dict [limit]   -> מנקד קטעים ייחודיים ושומר nikud-work/dict.json
//   node scripts/nikud-auto.mjs apply-all            -> מחיל את המילון על כל הדפים
//   node scripts/nikud-auto.mjs apply-one <file>     -> מחיל על דף בודד

import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import { glob } from 'node:fs/promises';

const API = 'https://nakdan-5-1.loadbalancer.dicta.org.il/api';
const HEB = /[א-ת]/;
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const SKIP = '.footer,.cta-box,.print-footer,.header-logo,.cta-qr';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- חילוץ הקטעים שהילד קורא (worksheet + example, בלי עמוד המטפל/פוטר) ----
function extractNodes(file) {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'));
  const doc = dom.window.document;
  const secs = [doc.querySelector('.kids-worksheet-section'), doc.querySelector('.kids-example-section')].filter(Boolean);
  const items = [];
  for (const sec of secs) {
    const w = doc.createTreeWalker(sec, dom.window.NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = norm(n.nodeValue || '');
      if (!t || !HEB.test(t)) continue;
      let p = n.parentElement, skip = false;
      while (p && p !== sec.parentElement) { if (p.matches && p.matches(SKIP)) { skip = true; break; } p = p.parentElement; }
      if (!skip) items.push(t);
    }
  }
  return items;
}

// ---- מיזוג: תווי מקור (אימוג'ים/גרשיים/לועזית) + ניקוד מנקדן (מילה-מילה) ----
const splitTokens = (s) => s.match(/[֑-ׇא-ת]+|[^֑-ׇא-ת]+/gu) || [];
const isHebWord = (t) => /[א-ת]/.test(t);
function merge(orig, nakRaw) {
  const nak = nakRaw.replace(/\|/g, '');
  const nakHeb = splitTokens(nak).filter(isHebWord);
  let hi = 0, res = '';
  for (const tok of splitTokens(orig)) {
    if (isHebWord(tok)) { res += (nakHeb[hi] ?? tok); hi++; }
    else res += tok;
  }
  return { merged: res, ok: hi === nakHeb.length };
}

async function nakad(text, tries = 4) {
  for (let a = 0; a < tries; a++) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Origin': 'https://nakdan.dicta.org.il' },
        body: JSON.stringify({ task: 'nakdan', data: text, genre: 'modern' }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error('bad json');
      return json.map((t) => (!t.sep && t.options && t.options.length ? t.options[0] : t.word)).join('');
    } catch (e) { if (a === tries - 1) throw e; await sleep(600 * (a + 1)); }
  }
}

async function mapLimit(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; ret[idx] = await fn(items[idx], idx); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return ret;
}

async function uniqueSegments() {
  const files = (await Array.fromAsync(glob('public/worksheets/*-kids-mytipul.html'))).sort();
  const uniq = new Set();
  for (const f of files) for (const it of extractNodes(f)) uniq.add(it);
  return { files, segs: [...uniq] };
}

const cmd = process.argv[2];

if (cmd === 'build-dict') {
  const limit = parseInt(process.argv[3] || '0', 10);
  let { segs } = await uniqueSegments();
  if (limit) segs = segs.slice(0, limit);
  const dict = {};
  let done = 0, fails = 0, imbalance = 0;
  const t0 = Date.now();
  await mapLimit(segs, 6, async (seg) => {
    try {
      const nak = await nakad(seg);
      const { merged, ok } = merge(seg, nak);
      dict[seg] = merged;
      if (!ok) { imbalance++; }
    } catch (e) { fails++; dict[seg] = seg; }
    if (++done % 200 === 0) console.log(`${done}/${segs.length} (${Math.round((Date.now()-t0)/1000)}s)`);
  });
  fs.mkdirSync('nikud-work', { recursive: true });
  fs.writeFileSync('nikud-work/dict.json', JSON.stringify(dict), 'utf8');
  console.log(`נשמר dict.json: ${Object.keys(dict).length} ערכים | ${fails} כשלים | ${imbalance} אי-איזון | ${Math.round((Date.now()-t0)/1000)}s`);
} else if (cmd === 'apply-all' || cmd === 'apply-one') {
  const dict = JSON.parse(fs.readFileSync('nikud-work/dict.json', 'utf8'));
  const files = cmd === 'apply-one'
    ? [process.argv[3]]
    : (await Array.fromAsync(glob('public/worksheets/*-kids-mytipul.html'))).sort();
  let totalSegs = 0, totalPages = 0;
  for (const file of files) {
    const origs = [...new Set(extractNodes(file))];
    let html = fs.readFileSync(file, 'utf8');
    const si = html.indexOf('<div class="kids-worksheet-section">');
    if (si < 0) { console.log('דילוג (אין section):', file); continue; }
    const head = html.slice(0, si);
    let body = html.slice(si);
    const pairs = origs
      .filter((o) => dict[o] && dict[o] !== o && body.includes(o))
      .map((o) => [o, dict[o]])
      .sort((a, b) => b[0].length - a[0].length);
    pairs.forEach(([o], i) => { body = body.split(o).join('@@NK' + i + 'NK@@'); });
    pairs.forEach(([, nik], i) => { body = body.split('@@NK' + i + 'NK@@').join(nik); });
    fs.writeFileSync(file, head + body, 'utf8');
    totalSegs += pairs.length; totalPages++;
  }
  console.log(`הוחלו ${totalSegs} קטעים ב-${totalPages} דפים.`);
} else {
  console.log('שימוש: build-dict [limit] | apply-all | apply-one <file>');
}
