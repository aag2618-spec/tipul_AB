import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { readFile, stat } from "fs/promises";
import { join } from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { path } = await params;
    const pathStr = path.join("/");

    // Security: Verify file ownership
    // Check if it's a document
    if (pathStr.startsWith("documents/")) {
      const fileName = path[path.length - 1];
      const document = await prisma.document.findFirst({
        where: {
          fileUrl: { contains: fileName },
          therapistId: session.user.id,
        },
      });
      if (!document) {
        return NextResponse.json({ message: "אין הרשאה לקובץ זה" }, { status: 403 });
      }
    }
    // Check if it's a recording
    else if (pathStr.startsWith("recordings/")) {
      const fileName = path[path.length - 1];
      const recording = await prisma.recording.findFirst({
        where: {
          audioUrl: { contains: fileName },
          client: { therapistId: session.user.id },
        },
      });
      if (!recording) {
        return NextResponse.json({ message: "אין הרשאה לקובץ זה" }, { status: 403 });
      }
    }

    // Use persistent disk on Render, fallback to local for development
    const baseDir = process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
    const filePath = join(baseDir, ...path);

    // Security: Prevent directory traversal
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
    }

    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": file.length.toString(),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("File serve error:", error);
    return NextResponse.json(
      { message: "Error serving file" },
      { status: 500 }
    );
  }
}


