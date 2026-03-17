import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.RENDER_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const { service, deploy, timestamp } = body;

    // Log deployment event
    const logEntry = {
      timestamp: new Date(timestamp || Date.now()),
      serviceId: service?.id || "unknown",
      serviceName: service?.name || "unknown",
      deployId: deploy?.id || "unknown",
      status: deploy?.status || "unknown",
      commit: deploy?.commit?.id || "unknown",
      commitMessage: deploy?.commit?.message || "unknown",
      error: deploy?.error || null,
      fullPayload: body,
    };

    logger.info("🚀 Deploy Status:", { data: {
      service: logEntry.serviceName,
      status: logEntry.status,
      commit: logEntry.commitMessage,
    } });

    // If deploy failed, log error
    if (deploy?.status === "build_failed" || deploy?.status === "deploy_failed") {
      logger.error("DEPLOY FAILED", {
        service: logEntry.serviceName,
        deployId: logEntry.deployId,
        error: deploy?.error || "Unknown error",
        commit: logEntry.commitMessage,
      });

      // Optionally: Send email notification
      // You can integrate with Resend to send email alerts
      // await sendDeployFailureEmail(logEntry);
    }

    // If deploy succeeded
    if (deploy?.status === "live") {
      logger.info("✅ DEPLOY SUCCESSFUL:", { data: {
        service: logEntry.serviceName,
        deployId: logEntry.deployId,
        commit: logEntry.commitMessage,
      } });
    }

    return NextResponse.json({ 
      received: true,
      status: deploy?.status,
      message: "Webhook processed successfully" 
    });

  } catch (error) {
    logger.error("Error processing Render webhook", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

