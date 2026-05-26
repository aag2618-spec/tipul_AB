import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { checkRateLimit, API_RATE_LIMIT } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

const FILENAME = "mytipul-logo-preview.html";

/**
 * Single HTML file with embedded logo (data URL) for saving to Downloads and opening offline.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`download:logo:${ip}`, API_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "יותר מדי בקשות" }, { status: 429 });
  }
  const root = process.cwd();
  const logoPath = path.join(root, "public", "logo.png");
  const htmlPath = path.join(root, "public", "dashboard-logo-preview.html");

  const [logoBuf, htmlRaw] = await Promise.all([
    readFile(logoPath),
    readFile(htmlPath, "utf8"),
  ]);

  const dataUrl = `data:image/png;base64,${logoBuf.toString("base64")}`;
  const html = htmlRaw.replace(
    '<img src="logo.png" alt="MyTipul" width="1376" height="768" />',
    `<img src="${dataUrl}" alt="MyTipul" width="1376" height="768" />`
  );

  const offlineNote = `<div class="note">
          <strong>קובץ זה הורד מהאפליקציה</strong> — הלוגו מוטמע בתוך הקובץ (אין צורך ב־<code>logo.png</code> נפרד). פותחים בלחיצה כפולה מתיקיית ההורדות.
        </div>`;

  const htmlWithBanner = html.replace(
    "<main class=\"main\">",
    `<main class="main">${offlineNote}`
  );

  return new NextResponse(htmlWithBanner, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FILENAME}"`,
    },
  });
}
