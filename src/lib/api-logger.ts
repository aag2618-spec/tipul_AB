import prisma from "./prisma";

interface LogApiUsageParams {
  userId: string;
  endpoint: string;
  method?: string;
  tokensUsed?: number;
  cost?: number;
  success?: boolean;
  errorMessage?: string;
  durationMs?: number;
}

/**
 * Logs API usage to the database for admin tracking
 */
export async function logApiUsage({
  userId,
  endpoint,
  method = "POST",
  tokensUsed,
  cost,
  success = true,
  errorMessage,
  durationMs,
}: LogApiUsageParams): Promise<void> {
  try {
    await prisma.apiUsageLog.create({
      data: {
        userId,
        endpoint,
        method,
        tokensUsed,
        cost,
        success,
        errorMessage,
        durationMs,
      },
    });
  } catch (error) {
    // Don't let logging failures affect the main request
    console.error("Failed to log API usage:", error);
  }
}

/**
 * Estimates the cost of an API call based on tokens used
 * Based on approximate Google AI pricing
 */
export function estimateCost(tokensUsed: number): number {
  // Rough estimate: $0.00025 per 1000 tokens for Gemini
  return (tokensUsed / 1000) * 0.00025;
}

/**
 * Estimates tokens from text length
 * Rough approximation: ~4 characters per token for Hebrew
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

