import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FILENAME = "mytipul-work-demo-cbt.html";

/** Self-contained HTML: sidebar + sample CBT work content + embedded logo. */
export async function GET() {
  const root = process.cwd();
  const logoPath = path.join(root, "public", "logo.png");
  const templatePath = path.join(root, "public", "work-demo-cbt.html");

  const [logoBuf, template] = await Promise.all([
    readFile(logoPath),
    readFile(templatePath, "utf8"),
  ]);

  const dataUrl = `data:image/png;base64,${logoBuf.toString("base64")}`;
  const html = template.replaceAll("__LOGO_DATA_URL__", dataUrl);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FILENAME}"`,
    },
  });
}
