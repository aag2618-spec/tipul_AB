import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const file = process.argv[2];
const out = process.argv[3] || '_preview.png';
const selector = process.argv[4] || '.kids-worksheet-section';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 2 });

// חסימת רשת חיצונית (פונטים) — טעינה מיידית עם fallback, בלי יציאה לאינטרנט
await page.setRequestInterception(true);
page.on('request', (req) => {
  const u = req.url();
  if (u.startsWith('file:') || u.startsWith('data:')) req.continue();
  else req.abort();
});

await page.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded', timeout: 20000 });
await new Promise((r) => setTimeout(r, 600));

const el = await page.$(selector);
await el.screenshot({ path: out });
await browser.close();
console.log('צולם ->', out);
