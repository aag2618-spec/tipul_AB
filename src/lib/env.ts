// Environment variables configuration
// Copy these to your .env.local file:
// 
// DATABASE_URL="postgresql://username:password@localhost:5432/tipul?schema=public"
// NEXTAUTH_SECRET="your-secret-key-here"
// NEXTAUTH_URL="http://localhost:3000"
// GOOGLE_AI_API_KEY="your-google-ai-api-key"
// ANTHROPIC_API_KEY="your-anthropic-api-key"
// RESEND_API_KEY="your-resend-api-key"

// Validate critical environment variables
function validateEnv() {
  const errors: string[] = [];
  
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }
  
  if (!process.env.NEXTAUTH_SECRET) {
    errors.push('NEXTAUTH_SECRET is required');
  }
  
  if (!process.env.NEXTAUTH_URL && process.env.NODE_ENV === 'production') {
    errors.push('NEXTAUTH_URL is required in production');
  }
  
  if (errors.length > 0) {
    console.error('Environment validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variables: ${errors.join(', ')}`);
    }
  }
}

// Run validation
if (typeof window === 'undefined') {
  validateEnv();
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '', // Optional - no longer used
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
} as const;













