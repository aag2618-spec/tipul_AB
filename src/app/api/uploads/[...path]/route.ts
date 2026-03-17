import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { readFile, stat } from "fs/promises";
import { join, resolve } from "path";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { path } = await params;

    if (path.some((segment) => segment === ".." || segment.includes("\0"))) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const pathStr = path.join("/");

    // Security: Verify file ownership
    // Check if it's a document
    if (pathStr.startsWith("documents/")) {
      const fileName = path[path.length - 1];
      const document = await prisma.document.findFirst({
        where: {
          fileUrl: { endsWith: '/' + fileName },
          therapistId: userId,
        },
      });
      if (!document) {
        return NextResponse.json({ message: "אין הרשאה לקובץ זה" }, { status: 403 });
      }
    }
    // Check if it's a client attachment (saved from email)
    else if (pathStr.startsWith("clients/")) {
      const fileName = path[path.length - 1];
      const document = await prisma.document.findFirst({
        where: {
          fileUrl: { endsWith: '/' + fileName },
          therapistId: userId,
        },
      });
      if (!document) {
        return NextResponse.json({ message: "אין הרשאה לקובץ זה" }, { status: 403 });
      }
    }
    else if (pathStr.startsWith("sent/")) {
      const clientId = path.length >= 2 ? path[1] : null;
      if (!clientId) {
        return NextResponse.json({ message: "אין הרשאה לקובץ זה" }, { status: 403 });
      }
      const log = await prisma.communicationLog.findFirst({
        where: {
          userId: userId,
          clientId: clientId,
        },
      });
      if (!log) {
        return NextResponse.json({ message: "אין הרשאה לקובץ זה" }, { status: 403 });
      }
    }
    // Check if it's a recording
    else if (pathStr.startsWith("recordings/")) {
      const fileName = path[path.length - 1];
      const recording = await prisma.recording.findFirst({
        where: {
          audioUrl: { endsWith: '/' + fileName },
          client: { therapistId: userId },
        },
      });
      if (!recording) {
        return NextResponse.json({ message: "אין הרשאה לקובץ זה" }, { status: 403 });
      }
    }

    const baseDir = resolve(process.env.UPLOADS_DIR || join(process.cwd(), "uploads"));
    const filePath = resolve(baseDir, ...path);

    if (!filePath.startsWith(baseDir)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ message: "File not found" }, { status: 404 });
    }

    const file = await readFile(filePath);
    
    // Determine content type based on extension
    const extension = filePath.split(".").pop()?.toLowerCase();
    let contentType = "application/octet-stream";
    
    switch (extension) {
      case "webm":
        contentType = "audio/webm";
        break;
      case "mp3":
        contentType = "audio/mpeg";
        break;
      case "wav":
        contentType = "audio/wav";
        break;
      case "ogg":
        contentType = "audio/ogg";
        break;
      case "pdf":
        contentType = "application/pdf";
        break;
      case "doc":
        contentType = "application/msword";
        break;
      case "docx":
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        break;
      case "txt":
        contentType = "text/plain";
        break;
      case "jpg":
      case "jpeg":
        contentType = "image/jpeg";
        break;
      case "png":
        contentType = "image/png";
        break;
      case "gif":
        contentType = "image/gif";
        break;
      case "webp":
        contentType = "image/webp";
        break;
      case "htm":
      case "html":
        contentType = "text/html";
        break;
      case "csv":
        contentType = "text/csv";
        break;
      case "xlsx":
        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;
      case "xls":
        contentType = "application/vnd.ms-excel";
        break;
      case "zip":
        contentType = "application/zip";
        break;
    }

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": file.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    logger.error("File serve error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Error serving file" },
      { status: 500 }
    );
  }
}

