import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FILENAME = "mytipul-cbt-thought-record.html";

export async function GET() {
  const root = process.cwd();
  const templatePath = path.join(
    root,
    "public",
    "worksheets",
    "cbt-thought-record-mytipul.html"
  );
  const html = await readFile(templatePath, "utf8");

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FILENAME}"`,
    },
  });
}
