import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { checkRateLimit, resetRateLimit, AUTH_RATE_LIMIT, LOGIN_EMAIL_RATE_LIMIT } from "./rate-limit";

// Cache for JWT user data — avoids DB query on every request
const JWT_CACHE_TTL = 2 * 60 * 1000; // 2 דקות
interface JwtUserData {
  role: "USER" | "MANAGER" | "ADMIN";
  isBlocked: boolean;
  subscriptionStatus: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED" | null;
  subscriptionEndsAt: Date | null;
  trialEndsAt: Date | null;
}
const jwtUserCache = new Map<string, { data: JwtUserData; timestamp: number }>();

// ניקוי cache כל דקה — מונע גדילה בלתי מוגבלת (guard מונע כפילויות ב-hot reload)
let cleanupInitialized = false;
if (!cleanupInitialized) {
  cleanupInitialized = true;
  setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of jwtUserCache.entries()) {
      if (now - entry.timestamp >= JWT_CACHE_TTL) {
        jwtUserCache.delete(userId);
      }
    }
  }, 60 * 1000);
}

// Hash דמה ל-bcrypt.compare כש-user לא קיים — מונע timing attack שמזהה אילו אימיילים רשומים.
// ה-Promise נוצר מיד כש-module נטען (eager init), כך שאין first-call overhead שיוצר
// הפרש זמן בין הקריאה הראשונה אחרי startup לקריאות הבאות.
const dummyBcryptHashPromise: Promise<string> = bcrypt.hash(
  "placeholder-for-timing-protection",
  12
);
function getDummyBcryptHash(): Promise<string> {
  return dummyBcryptHashPromise;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: {
                scope: "openid email profile https://www.googleapis.com/auth/calendar",
                access_type: "offline",
                prompt: "consent",
              },
            },
          }),
        ]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "אימייל", type: "email" },
        password: { label: "סיסמה", type: "password" },
      },
      async authorize(credentials, req) {
        // Rate limit כפול על login — 10 ניסיונות ל-15 דקות, גם לפי IP וגם לפי email.
        // לפי IP — מונע brute force פשוט מ-IP בודד.
        // לפי email — מונע distributed brute force (תוקף עם בוטנט של 100 IPs).
        // ה-counters מתאפסים אחרי login מוצלח (resetRateLimit למטה) כדי למנוע DoS על משתמש לגיטימי.
        const headers = req?.headers as Record<string, string | string[] | undefined> | undefined;
        const xff = headers?.["x-forwarded-for"];
        const xri = headers?.["x-real-ip"];
        const ipRaw = (Array.isArray(xff) ? xff[0] : xff) || (Array.isArray(xri) ? xri[0] : xri);
        const ip = ipRaw ? String(ipRaw).split(",")[0].trim() : null;
        const emailLower = credentials?.email?.toLowerCase() || "anon";
        const ipKey = ip ? `login:ip:${ip}` : null;
        const emailKey = `login:email:${emailLower}`;
        const ipResult = ipKey ? checkRateLimit(ipKey, AUTH_RATE_LIMIT) : { allowed: true };
        // חלון קצר יותר ל-email (5 דק' / 5 ניסיונות) — מקטין DoS על משתמש לגיטימי
        const emailResult = checkRateLimit(emailKey, LOGIN_EMAIL_RATE_LIMIT);
        if (!ipResult.allowed || !emailResult.allowed) {
          throw new Error("יותר מדי ניסיונות התחברות. נסה שוב בעוד 15 דקות");
        }

        if (!credentials?.email || !credentials?.password) {
          throw new Error("אנא הזן אימייל וסיסמה");
        }

        // חיפוש case-insensitive — חלק מהמשתמשים נרשמו עם אותיות גדולות
        const user = await prisma.user.findFirst({
          where: { email: { equals: credentials.email, mode: "insensitive" } },
        });

        // הודעת שגיאה אחידה — מונעת Email Enumeration (תוקף לא יכול לדעת אם האימייל קיים)
        const INVALID_CREDENTIALS = "אימייל או סיסמה שגויים";

        // bcrypt.compare תמיד רץ — אם user לא קיים, מול hash דמה.
        // זה מבטיח שזמן התגובה זהה לכל הנתיבים של INVALID_CREDENTIALS,
        // ומונע timing attack שמזהה אילו אימיילים רשומים.
        const hashToCompare = user?.password || (await getDummyBcryptHash());
        const isValid = await bcrypt.compare(credentials.password, hashToCompare);

        if (!user || !user.password || !isValid) {
          throw new Error(INVALID_CREDENTIALS);
        }

        // מכאן הסיסמה אומתה. בדיקות ספציפיות שמדליפות מידע על החשבון —
        // רק לאחר אימות הסיסמה (תוקף שלא יודע את הסיסמה לא יראה את ההודעות האלה).
        if (user.isBlocked) {
          throw new Error("המשתמש חסום. אנא פנה למנהל המערכת");
        }

        // Check email verification - skip for ADMIN users and users created before verification system
        if (!user.emailVerified && user.role !== "ADMIN") {
          // Auto-verify users created before the email verification system was added
          // (they don't have emailVerificationToken, meaning they never went through the new registration flow)
          if (!user.emailVerificationToken && !user.emailVerificationExpires) {
            // Old user - auto verify
            await prisma.user.update({
              where: { id: user.id },
              data: { emailVerified: new Date() },
            });
          } else {
            throw new Error("יש לאמת את כתובת המייל לפני ההתחברות. בדוק את תיבת הדואר שלך.");
          }
        }

        // Login הצליח — איפוס מוני ה-rate limit כדי שתוקף שניסה brute force
        // לא ימשיך לחסום את המשתמש הלגיטימי אחרי שזה נכנס בהצלחה.
        if (ipKey) resetRateLimit(ipKey);
        resetRateLimit(emailKey);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // 24 שעות תוקף — אם המשתמש פעיל פעם בשעה, ה-session מתחדש אוטומטית
    maxAge: 24 * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  events: {
    async createUser({ user }) {
      // הקצאת מספר משתמש אוטומטי למשתמשים חדשים (כולל OAuth/Google)
      // עטוף בטרנזקציה עם retry למניעת race condition
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await prisma.$transaction(async (tx) => {
            const maxResult = await tx.user.aggregate({ _max: { userNumber: true } });
            const nextUserNumber = (maxResult._max.userNumber ?? 1000) + 1;
            await tx.user.update({
              where: { id: user.id },
              data: { userNumber: nextUserNumber },
            });
          });
          break; // הצלחה — יוצא מהלולאה
        } catch (error) {
          if (attempt === 2) {
            console.error(`נכשל בהקצאת מספר משתמש ל-${user.id} אחרי 3 ניסיונות:`, error);
          }
          // ממתין קצרה לפני ניסיון נוסף
        }
      }
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Allow credentials login as-is
      if (account?.provider === "credentials") return true;

      // Google OAuth: link to existing user if email matches
      if (account?.provider === "google" && profile?.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: profile.email.toLowerCase() },
        });

        if (existingUser) {
          // Check if Google account already linked
          const existingAccount = await prisma.account.findFirst({
            where: { userId: existingUser.id, provider: "google" },
          });

          if (!existingAccount) {
            // Link Google account to existing user
            await prisma.account.create({
              data: {
                userId: existingUser.id,
                type: account.type,
                provider: account.provider,
                providerAccountId: account.providerAccountId,
                access_token: account.access_token || null,
                refresh_token: account.refresh_token || null,
                expires_at: account.expires_at || null,
                token_type: account.token_type || null,
                scope: account.scope || null,
                id_token: account.id_token || null,
              },
            });
          } else {
            // Update existing tokens
            await prisma.account.update({
              where: { id: existingAccount.id },
              data: {
                access_token: account.access_token || null,
                refresh_token: account.refresh_token || null,
                expires_at: account.expires_at || null,
                id_token: account.id_token || null,
              },
            });
          }

          // Override user.id so JWT callback uses the existing user
          user.id = existingUser.id;
          user.role = existingUser.role as "USER" | "MANAGER" | "ADMIN";
        }
      }

      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      
      // Refresh role and subscription status from database (cached for 5 minutes)
      if (token.id) {
        const userId = token.id as string;
        const cached = jwtUserCache.get(userId);
        const now = Date.now();

        let dbUser;
        if (cached && (now - cached.timestamp) < JWT_CACHE_TTL) {
          dbUser = cached.data;
        } else {
          dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              role: true,
              isBlocked: true,
              subscriptionStatus: true,
              subscriptionEndsAt: true,
              trialEndsAt: true,
            },
          });
          if (dbUser) {
            jwtUserCache.set(userId, { data: dbUser, timestamp: now });
          }
        }
        if (dbUser) {
          token.role = dbUser.role;
          token.subscriptionStatus = dbUser.subscriptionStatus || undefined;
          token.isBlocked = dbUser.isBlocked || false;
          
          // Grace period: 7 ימים אחרי שהמנוי פג לפני חסימה
          const GRACE_PERIOD_DAYS = 7;
          const gracePeriodMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
          
          // בדיקה אם תקופת הניסיון הסתיימה
          if (dbUser.subscriptionStatus === "TRIALING" && dbUser.trialEndsAt) {
            const trialEnd = new Date(dbUser.trialEndsAt);
            const now = new Date();
            if (now > trialEnd) {
              // בתוך תקופת החסד - רק הודעה, לא חסימה
              if (now.getTime() - trialEnd.getTime() <= gracePeriodMs) {
                token.subscriptionStatus = "PAST_DUE";
                token.gracePeriodEndsAt = new Date(trialEnd.getTime() + gracePeriodMs).toISOString();
              } else {
                // תקופת החסד נגמרה - חסום
                token.subscriptionStatus = "CANCELLED";
              }
            }
          }
          
          // בדיקה אם המנוי פג תוקף
          if (dbUser.subscriptionStatus === "ACTIVE" && dbUser.subscriptionEndsAt) {
            const subEnd = new Date(dbUser.subscriptionEndsAt);
            const now = new Date();
            if (now > subEnd) {
              // בתוך תקופת החסד
              if (now.getTime() - subEnd.getTime() <= gracePeriodMs) {
                token.subscriptionStatus = "PAST_DUE";
                token.gracePeriodEndsAt = new Date(subEnd.getTime() + gracePeriodMs).toISOString();
              } else {
                // תקופת החסד נגמרה
                token.subscriptionStatus = "CANCELLED";
              }
            }
          }

          // בדיקה חשובה: מנוי שביטל אבל עדיין בתוך התקופה ששילם עליה
          // המנוי ביטל (CANCELLED) אבל subscriptionEndsAt עדיין בעתיד = ממשיך לעבוד
          if (dbUser.subscriptionStatus === "CANCELLED" && dbUser.subscriptionEndsAt) {
            const subEnd = new Date(dbUser.subscriptionEndsAt);
            const now = new Date();
            if (now < subEnd) {
              // עדיין בתוך התקופה ששילם - נותנים גישה מלאה
              token.subscriptionStatus = "ACTIVE";
            }
          }
          
          // PAUSED - מושהה, נותנים גישה עם אזהרה (כמו PAST_DUE)
          if (dbUser.subscriptionStatus === "PAUSED") {
            token.subscriptionStatus = "PAST_DUE";
          }
        }
      }
      
      // Save Google tokens for calendar access
      if (account?.provider === "google") {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "USER" | "MANAGER" | "ADMIN";
      }
      return session;
    },
  },
};

// Extend NextAuth types
declare module "next-auth" {
  interface User {
    role?: "USER" | "MANAGER" | "ADMIN";
  }
  
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "USER" | "MANAGER" | "ADMIN";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role?: "USER" | "MANAGER" | "ADMIN";
    subscriptionStatus?: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";
    isBlocked?: boolean;
    gracePeriodEndsAt?: string; // ISO date string - מתי נגמרת תקופת החסד
  }
}
