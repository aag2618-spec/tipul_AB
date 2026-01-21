import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Render Webhook handler for deployment events
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    console.log("📥 Render Webhook received:", JSON.stringify(body, null, 2));

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

    console.log("🚀 Deploy Status:", {
      service: logEntry.serviceName,
      status: logEntry.status,
      commit: logEntry.commitMessage,
    });

    // If deploy failed, log error
    if (deploy?.status === "build_failed" || deploy?.status === "deploy_failed") {
      console.error("❌ DEPLOY FAILED:", {
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
      console.log("✅ DEPLOY SUCCESSFUL:", {
        service: logEntry.serviceName,
        deployId: logEntry.deployId,
        commit: logEntry.commitMessage,
      });
    }

    return NextResponse.json({ 
      received: true,
      status: deploy?.status,
      message: "Webhook processed successfully" 
    });

  } catch (error) {
    console.error("Error processing Render webhook:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

// Allow GET for testing
export async function GET() {
  return NextResponse.json({ 
    message: "Render Webhook Endpoint",
    status: "active",
    info: "POST deployment events here"
  });
}
