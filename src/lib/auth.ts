import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "./prisma";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("אנא הזן אימייל וסיסמה");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("משתמש לא נמצא");
        }

        // Check if user is blocked
        if (user.isBlocked) {
          throw new Error("המשתמש חסום. אנא פנה למנהל המערכת");
        }

        // Check email verification
        if (!user.emailVerified) {
          throw new Error("יש לאמת את כתובת המייל לפני ההתחברות. בדוק את תיבת הדואר שלך.");
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("סיסמה שגויה");
        }

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
  },
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      
      // Refresh role and subscription status from database on each request
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { 
            role: true, 
            isBlocked: true,
            subscriptionStatus: true,
            subscriptionEndsAt: true,
            trialEndsAt: true,
          },
        });
        if (dbUser) {
          token.role = dbUser.role;
          token.subscriptionStatus = dbUser.subscriptionStatus;
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
