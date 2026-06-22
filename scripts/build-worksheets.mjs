// מחולל דפי עבודה — מייצר HTML עצמאי לכל דף מתוך מקור-תוכן יחיד:
// src/lib/worksheets-content.mjs (אותו מקור משמש גם את דף הקטלוג בתצוגה).
//
// שימוש:
//   node scripts/build-worksheets.mjs            → מייצר את כל הדפים החדשים
//
// אחרי הריצה יש להריץ את מחולל ה-PDF:
//   node scripts/generate-worksheet-pdfs.mjs <slug> public

import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { worksheetsContent } from "../src/lib/worksheets-content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const wsDir = path.join(root, "public", "worksheets");

const logo = (await readFile(path.join(wsDir, "_logo-base64.txt"), "utf8")).trim();

// פלטות צבע (Tailwind) — 50..800 + rgb לצל
const PALETTES = {
  teal: { s: [ "#f0fdfa","#ccfbf1","#99f6e4","#5eead4","#2dd4bf","#14b8a6","#0d9488","#0f766e","#115e59" ], rgb: "13,148,136" },
  violet: { s: [ "#f5f3ff","#ede9fe","#ddd6fe","#c4b5fd","#a78bfa","#8b5cf6","#7c3aed","#6d28d9","#5b21b6" ], rgb: "124,58,237" },
  orange: { s: [ "#fff7ed","#ffedd5","#fed7aa","#fdba74","#fb923c","#f97316","#ea580c","#c2410c","#9a3412" ], rgb: "234,88,12" },
  emerald: { s: [ "#ecfdf5","#d1fae5","#a7f3d0","#6ee7b7","#34d399","#10b981","#059669","#047857","#065f46" ], rgb: "5,150,105" },
  rose: { s: [ "#fff1f2","#ffe4e6","#fecdd3","#fda4af","#fb7185","#f43f5e","#e11d48","#be123c","#9f1239" ], rgb: "225,29,72" },
  sky: { s: [ "#f0f9ff","#e0f2fe","#bae6fd","#7dd3fc","#38bdf8","#0ea5e9","#0284c7","#0369a1","#075985" ], rgb: "2,132,199" },
  indigo: { s: [ "#eef2ff","#e0e7ff","#c7d2fe","#a5b4fc","#818cf8","#6366f1","#4f46e5","#4338ca","#3730a3" ], rgb: "79,70,229" },
  cyan: { s: [ "#ecfeff","#cffafe","#a5f3fc","#67e8f9","#22d3ee","#06b6d4","#0891b2","#0e7490","#155e75" ], rgb: "8,145,178" },
  amber: { s: [ "#fffbeb","#fef3c7","#fde68a","#fcd34d","#fbbf24","#f59e0b","#d97706","#b45309","#92400e" ], rgb: "217,119,6" },
};

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function scaleRow(label, value) {
  const dots = Array.from({ length: 11 }, (_, i) => {
    const hl = value === i ? ' style="background:var(--th-500);color:#fff;border-color:var(--th-500);"' : "";
    return `<div class="scale-dot"${hl}>${i}</div>`;
  }).join("");
  return `<div class="scale-row"><span class="scale-label">${esc(label)}</span><div class="scale-dots">${dots}</div></div>`;
}

function section(s) {
  const en = s.titleEn ? ` <span class="section-title-en">${esc(s.titleEn)}</span>` : "";
  const icon = s.icon ? `<span class="icon">${s.icon}</span>` : "";
  const hint = s.hint ? `<div class="section-hint">${icon}<span>${esc(s.hint)}</span></div>` : "";
  let body = "";
  if (s.type === "scale") {
    body = scaleRow(s.scaleLabel || "דרגו 0–10:");
  } else if (s.type === "write-scale") {
    body = `<div class="write-area write-area-sm"></div>${scaleRow(s.scaleLabel || "דרגו 0–10:")}`;
  } else if (s.type === "table") {
    const heads = (s.headers || []).map((h) => `<th>${esc(h)}</th>`).join("");
    const cols = (s.headers || []).length || 1;
    const row = `<tr>${Array.from({ length: cols }, () => "<td></td>").join("")}</tr>`;
    body = `<table class="activity-table"><thead><tr>${heads}</tr></thead><tbody>${Array.from({ length: s.rows || 4 }, () => row).join("")}</tbody></table>`;
  } else if (s.type === "numbered") {
    body = Array.from({ length: s.count || 3 }, (_, i) => `<div class="numbered-line"><div class="num">${i + 1}</div><div class="line"></div></div>`).join("");
  } else {
    body = `<div class="write-area"></div>`;
  }
  return `<div class="section"><div class="section-header"><div class="section-number">${esc(s.n)}</div><div><span class="section-title">${esc(s.title)}</span>${en}</div></div><div class="section-body">${hint}${body}</div></div>`;
}

function therapistBox(t) {
  const purpose = (t.purpose || []).map((p) => `<p>${esc(p)}</p>`).join("");
  let whenTbl = "";
  if (t.when) {
    const heads = t.when.headers.map((h) => `<th>${esc(h)}</th>`).join("");
    const rows = t.when.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
    whenTbl = `<h2 style="margin-top:14px;">🛠 מתי להשתמש</h2><table class="therapist-table"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  const tips = (t.tips || []).map((x) => `<li>${esc(x)}</li>`).join("");
  const cautions = (t.cautions || []).map((x) => `<li>${esc(x)}</li>`).join("");
  return `<div class="therapist-box"><h2>📚 מטרת הכלי</h2>${purpose}${whenTbl}<h2 style="margin-top:14px;">🎓 טיפים למטפל</h2><ul>${tips}</ul><h2 style="margin-top:14px;">⚠️ שימו לב</h2><ul>${cautions}</ul></div>`;
}

function header(ws, variant) {
  const sub = variant === "therapist" ? `${esc(ws.subtitle)} — הוראות למטפל` : variant === "example" ? `${esc(ws.subtitle)} — דוגמה` : esc(ws.subtitle);
  let meta = "";
  if (variant === "therapist") {
    meta = `<div class="header-meta"><label>שם המטפל/ת: <span class="meta-line"></span></label></div>`;
  } else if (variant === "example") {
    meta = `<div class="header-meta"><label>שם: <span style="border-bottom:1.5px dashed rgba(255,255,255,0.6);min-width:130px;height:1.3em;font-style:italic;">${esc(ws.example.name)}</span></label><label>תאריך: <span style="border-bottom:1.5px dashed rgba(255,255,255,0.6);min-width:130px;height:1.3em;font-style:italic;">${esc(ws.example.date)}</span></label></div>`;
  } else {
    meta = `<div class="header-meta"><label>שם: <span class="meta-line"></span></label><label>תאריך: <span class="meta-line"></span></label><label>גיל: <span class="meta-line"></span></label></div>`;
  }
  return `<header class="header"><div class="header-content"><div class="header-badge">${esc(ws.approach)} • ${esc(ws.approachHe)}</div><h1>${esc(ws.title)}</h1><p class="subtitle">${sub}</p>${meta}</div><div class="header-logo"><a href="https://mytipul.com" target="_blank" rel="noopener"><img src="${logo}" alt="MyTipul" /></a></div></header>`;
}

function exampleItem(it) {
  const scale = it.scale ? scaleRow(it.scale.label, it.scale.value) : "";
  const head = it.title ? `<div class="section-header"><div class="section-number">${esc(it.n || "•")}</div><div><span class="section-title">${esc(it.title)}</span></div></div>` : "";
  return `<div class="section">${head}<div class="section-body"><div class="filled">${esc(it.text)}</div>${scale}</div></div>`;
}

function buildHtml(ws) {
  const pal = PALETTES[ws.color] || PALETTES.teal;
  const [c50, c100, c200, c300, c400, c500, c600, c700, c800] = pal.s;
  const footer = `<footer class="footer"><div>© MyTipul — כל הזכויות שמורות</div><a href="https://mytipul.com" target="_blank" rel="noopener">mytipul.com</a></footer>`;

  const sheetSections = ws.sections.map(section).join("\n");
  const summaryScale = ws.summary && ws.summary.scaleLabel ? `<div style="margin-bottom:12px;">${scaleRow(ws.summary.scaleLabel)}</div>` : "";
  const summary = ws.summary ? `<div class="summary-box"><h2><span>📝</span> סיכום</h2>${summaryScale}<p class="summary-hint">${esc(ws.summary.hint)}</p><div class="write-area"></div></div>` : "";
  const pattern = ws.pattern ? `<div class="pattern-box"><strong>🔄 מעקב דפוסים:</strong> ${esc(ws.pattern)}<div class="write-area"></div></div>` : "";
  const compassion = ws.compassion ? `<div class="compassion-box"><strong>💜 רגע של חמלה עצמית</strong><br>${esc(ws.compassion)}</div>` : "";

  const ex = ws.example;
  const exItems = ex.items.map(exampleItem).join("\n");
  const exSummary = ex.summary ? `<div class="summary-box"><h2><span>📝</span> סיכום</h2><div class="filled">${esc(ex.summary)}</div></div>` : "";
  const exPattern = ex.pattern ? `<div class="pattern-box"><strong>🔄 דפוס:</strong> ${esc(ex.pattern)}</div>` : "";
  const exCompassion = ex.compassion ? `<div class="compassion-box"><strong>💜</strong> ${esc(ex.compassion)}</div>` : "";

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(ws.title)} — ${esc(ws.titleEn)} | ${esc(ws.approach)} | MyTipul</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap');
    :root {
      --th-50:${c50};--th-100:${c100};--th-200:${c200};--th-300:${c300};--th-400:${c400};--th-500:${c500};--th-600:${c600};--th-700:${c700};--th-800:${c800};--th-shadow:${pal.rgb};
      --slate-50:#f8fafc;--slate-100:#f1f5f9;--slate-200:#e2e8f0;--slate-300:#cbd5e1;--slate-400:#94a3b8;--slate-500:#64748b;--slate-600:#475569;--slate-700:#334155;--slate-800:#1e293b;
      --amber-50:#fffbeb;--amber-100:#fef3c7;--amber-400:#fbbf24;--amber-600:#d97706;--amber-700:#b45309;
      --rose-50:#fff1f2;--rose-100:#ffe4e6;--rose-600:#e11d48;--radius:12px;
    }
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Heebo','Segoe UI',system-ui,sans-serif; background:#e5e7eb; color:var(--slate-800); line-height:1.6; font-size:15px; }
    .sheet { max-width:860px; margin:0 auto; padding:20px; }
    .therapist-section,.worksheet-body,.example-section { background:#fff; box-shadow:0 1px 8px rgba(0,0,0,0.1),0 0 1px rgba(0,0,0,0.05); border-radius:var(--radius); padding:28px 24px; margin-bottom:32px; }
    .header { background:linear-gradient(to right,var(--th-400) 0%,var(--th-600) 50%,var(--th-800) 100%); border-radius:var(--radius); padding:24px 28px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:20px; box-shadow:0 4px 20px rgba(var(--th-shadow),0.25); }
    .header-content { flex:1; }
    .header-badge { display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.18); backdrop-filter:blur(4px); color:#fff; font-size:0.75rem; font-weight:700; padding:4px 12px; border-radius:999px; margin-bottom:10px; }
    .header h1 { color:#fff; font-size:1.55rem; font-weight:800; margin-bottom:4px; text-shadow:0 1px 3px rgba(0,0,0,0.15); }
    .header .subtitle { color:rgba(255,255,255,0.9); font-size:0.92rem; }
    .header-meta { display:flex; flex-wrap:wrap; gap:18px; margin-top:14px; }
    .header-meta label { display:flex; align-items:center; gap:8px; color:rgba(255,255,255,0.92); font-size:0.88rem; font-weight:500; }
    .meta-line { border-bottom:1.5px dashed rgba(255,255,255,0.6); min-width:130px; height:1.3em; }
    .header-logo { flex-shrink:0; }
    .header-logo img { height:180px; width:auto; max-width:350px; object-fit:contain; display:block; }
    .header-logo a { display:block; text-decoration:none; }
    .therapist-section { margin-bottom:32px; }
    .therapist-box { background:linear-gradient(135deg,var(--amber-50) 0%,#fff8f0 100%); border:1.5px solid var(--amber-400); border-radius:var(--radius); padding:18px 20px; margin-bottom:20px; }
    .therapist-box h2 { font-size:0.95rem; font-weight:700; color:var(--amber-700); margin-bottom:10px; display:flex; align-items:center; gap:8px; }
    .therapist-box p { font-size:0.85rem; color:var(--slate-700); line-height:1.7; margin-bottom:8px; }
    .therapist-box p:last-child { margin-bottom:0; }
    .therapist-box ul { font-size:0.85rem; color:var(--slate-700); padding-right:20px; line-height:1.8; margin:6px 0; }
    .therapist-table { width:100%; border-collapse:collapse; margin:12px 0; font-size:0.82rem; }
    .therapist-table th,.therapist-table td { border:1px solid var(--slate-200); padding:8px 10px; text-align:right; }
    .therapist-table th { background:var(--amber-100); color:var(--amber-700); font-weight:700; }
    .grounding-box { background:linear-gradient(135deg,var(--th-50) 0%,#ffffff 100%); border:1.5px solid var(--th-200); border-radius:var(--radius); padding:14px 18px; margin-bottom:20px; text-align:center; font-size:0.95rem; }
    .grounding-box strong { color:var(--th-800); }
    .section { background:#fff; border:1.5px solid var(--slate-200); border-radius:var(--radius); margin-bottom:16px; box-shadow:0 1px 4px rgba(0,0,0,0.04); }
    .section-header { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid var(--slate-100); background:var(--slate-50); }
    .section-number { width:30px; height:30px; background:linear-gradient(135deg,var(--th-700),var(--th-500)); color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem; flex-shrink:0; }
    .section-title { font-size:1rem; font-weight:700; color:var(--slate-800); }
    .section-title-en { font-size:0.78rem; color:var(--slate-400); margin-right:6px; }
    .section-body { padding:14px 16px; }
    .section-hint { font-size:0.83rem; color:var(--slate-500); margin-bottom:10px; line-height:1.6; display:flex; align-items:flex-start; gap:6px; }
    .section-hint .icon { flex-shrink:0; margin-top:2px; }
    .write-area { min-height:75px; border:1.5px dashed var(--slate-300); border-radius:8px; background:var(--slate-50); }
    .write-area-sm { min-height:55px; }
    .activity-table { width:100%; border-collapse:collapse; margin-top:6px; font-size:0.85rem; }
    .activity-table th,.activity-table td { border:1px solid var(--slate-200); padding:8px 10px; text-align:right; }
    .activity-table th { background:var(--th-50); color:var(--th-800); font-weight:700; font-size:0.8rem; }
    .activity-table td { height:38px; }
    .numbered-line { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .numbered-line .num { width:26px; height:26px; flex-shrink:0; background:var(--th-100); color:var(--th-700); border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem; }
    .numbered-line .line { flex:1; min-height:34px; border:1.5px dashed var(--slate-300); border-radius:8px; background:var(--slate-50); }
    .scale-row { display:flex; align-items:center; gap:8px; margin-top:12px; padding:8px 12px; background:var(--th-50); border-radius:8px; border:1px solid var(--th-100); }
    .scale-label { font-size:0.82rem; font-weight:600; color:var(--th-800); white-space:nowrap; }
    .scale-dots { display:flex; gap:5px; flex:1; justify-content:center; }
    .scale-dot { width:28px; height:28px; border:1.5px solid var(--th-200); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.72rem; font-weight:600; color:var(--th-700); background:#fff; }
    .pattern-box { background:linear-gradient(135deg,var(--amber-50) 0%,#fffef5 100%); border:1.5px solid var(--amber-400); border-radius:var(--radius); padding:12px 16px; margin-bottom:14px; }
    .pattern-box strong { color:var(--amber-700); }
    .pattern-box .write-area { min-height:45px; margin-top:8px; border-color:var(--amber-400); background:rgba(255,255,255,0.6); }
    .summary-box { background:linear-gradient(135deg,var(--th-50) 0%,#ffffff 100%); border:2px solid var(--th-200); border-radius:var(--radius); padding:16px 18px; margin-bottom:16px; }
    .summary-box h2 { font-size:1rem; font-weight:700; color:var(--th-800); margin-bottom:6px; display:flex; align-items:center; gap:8px; }
    .summary-box .write-area { min-height:65px; border-color:var(--th-300); background:rgba(255,255,255,0.6); }
    .summary-hint { font-size:0.82rem; color:var(--th-700); margin-bottom:10px; }
    .compassion-box { background:linear-gradient(135deg,var(--rose-50) 0%,#fff5f7 100%); border:1.5px solid var(--rose-100); border-radius:var(--radius); padding:14px 18px; margin-bottom:16px; text-align:center; font-size:0.93rem; line-height:1.7; }
    .compassion-box strong { color:var(--rose-600); }
    .footer { padding:10px 0; border-top:1.5px solid var(--slate-200); display:flex; align-items:center; justify-content:space-between; font-size:0.82rem; color:var(--slate-700); margin-top:12px; font-weight:500; }
    .footer a { color:var(--th-600); text-decoration:none; font-weight:600; }
    .example-banner { background:linear-gradient(135deg,var(--amber-50) 0%,var(--amber-100) 100%); border:2.5px solid var(--amber-400); border-radius:var(--radius); padding:20px 24px; margin-bottom:20px; text-align:center; }
    .example-banner h2 { font-size:1.5rem; font-weight:800; color:var(--amber-700); margin-bottom:6px; }
    .example-banner p { font-size:0.95rem; color:var(--amber-600); font-weight:500; }
    .filled { background:#fff; border:1.5px solid var(--slate-200); border-radius:8px; padding:10px 14px; margin-top:6px; font-size:0.88rem; color:var(--slate-700); line-height:1.7; font-style:italic; }
    @media screen { .print-footer { display:none; } }
    .print-footer a { color:var(--th-600); text-decoration:none; font-weight:600; }
    @page { size:A4; margin:8mm 10mm 18mm 10mm; }
    @media print {
      html,body { background:#fff; font-size:15px; margin:0; padding:0; }
      .sheet { max-width:none; padding:0 8mm; margin:0; }
      .therapist-section,.worksheet-body,.example-section { box-shadow:none; padding:0; margin-bottom:0; border-radius:0; }
      .header,.header-badge,.section-number,.scale-row,.scale-dot,.grounding-box,.compassion-box,.pattern-box,.therapist-box,.summary-box,.example-banner,.header-logo,.numbered-line .num { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      .header { box-shadow:none; padding:16px 20px; margin-bottom:14px; }
      .header-logo img { height:150px !important; visibility:visible !important; display:block !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; max-width:350px; }
      .summary-box,.grounding-box,.compassion-box,.pattern-box,.example-banner,.header,.section,.section-header { break-inside:avoid; }
      .footer { display:none !important; }
      .print-footer { display:flex !important; position:fixed; bottom:0; left:0; right:0; align-items:center; justify-content:space-between; font-size:0.78rem; color:var(--slate-700); font-weight:500; padding:4px 10mm; border-top:1px solid var(--slate-200); background:#fff; z-index:9999; }
      .section { box-shadow:none; margin-bottom:8px; }
      .section-header { padding:8px 14px; }
      .section-body { padding:10px 14px; }
      .write-area { min-height:40px; }
      .write-area-sm { min-height:32px; }
      .numbered-line .line { min-height:28px; }
      .scale-dot { width:22px; height:22px; font-size:0.65rem; }
      .scale-row { padding:6px 10px; margin-top:8px; }
      .grounding-box { padding:8px 14px; margin-bottom:12px; font-size:0.85rem; }
      .summary-box { padding:12px 14px; margin-bottom:10px; }
      .summary-box .write-area { min-height:40px; }
      .pattern-box { padding:8px 14px; margin-bottom:10px; }
      .pattern-box .write-area { min-height:30px; }
      .compassion-box { padding:8px 14px; margin-bottom:10px; font-size:0.85rem; }
      p,li { orphans:3; widows:3; }
      .therapist-section { break-after:always; page-break-after:always; }
      .example-section { break-before:always; page-break-before:always; }
    }
    @media screen and (max-width:640px) {
      .header { flex-direction:column-reverse; text-align:center; padding:18px; }
      .header-logo { margin:0 auto 8px; } .header-logo img { height:120px; }
      .header-meta { justify-content:center; }
      .scale-dots { flex-wrap:wrap; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="therapist-section">
      ${header(ws, "therapist")}
      ${therapistBox(ws.therapist)}
      ${footer}
    </div>
    <div class="worksheet-body">
      ${header(ws, "sheet")}
      <div class="grounding-box"><strong>⏸ ${esc(ws.grounding)}</strong></div>
      ${sheetSections}
      ${summary}
      ${pattern}
      ${compassion}
      ${footer}
    </div>
    <div class="example-section">
      <div class="example-banner"><h2>📝 דוגמה ממולאת</h2><p>הדגמה ללמידה — לא דוגמה אמיתית</p></div>
      ${header(ws, "example")}
      <div class="grounding-box"><strong>⏸</strong> ${esc(ex.grounding || "עצרתי. נשמתי שלוש נשימות. מתחיל.")}</div>
      ${exItems}
      ${exSummary}
      ${exPattern}
      ${exCompassion}
      ${footer}
    </div>
  </div>
<div class="print-footer">
  <span>© MyTipul — כל הזכויות שמורות</span>
  <a href="https://mytipul.com">mytipul.com</a>
</div>
</body>
</html>`;
}

const all = worksheetsContent.categories.flatMap((c) => c.worksheets);
for (const ws of all) {
  const out = path.join(wsDir, `${ws.slug}-mytipul.html`);
  await writeFile(out, buildHtml(ws), "utf8");
  console.log(`  ✓ ${ws.slug}-mytipul.html`);
}
console.log(`\nהושלם. ${all.length} דפים נוצרו ב-${wsDir}\n`);
