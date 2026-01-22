// Environment variables configuration
// Copy these to your .env.local file:
// 
// DATABASE_URL="postgresql://username:password@localhost:5432/tipul?schema=public"
// NEXTAUTH_SECRET="your-secret-key-here"
// NEXTAUTH_URL="http://localhost:3000"
// GOOGLE_AI_API_KEY="your-google-ai-api-key"
// ANTHROPIC_API_KEY="your-anthropic-api-key"
// RESEND_API_KEY="your-resend-api-key"

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '', // Optional - no longer used
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
} as const;













