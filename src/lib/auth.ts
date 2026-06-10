import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import prisma from "./prisma";
import { checkRateLimit, resetRateLimit, AUTH_RATE_LIMIT, LOGIN_EMAIL_RATE_LIMIT } from "./rate-limit";
import { requires2FA, isTwoFactorVerifiedForLogin } from "./two-factor";
import { loadVerifiedImpersonation, type JwtActingAs } from "./impersonation";
import { sendEmail } from "./resend";
import { logger } from "./logger";
import { escapeHtml } from "./email-utils";

// Cache for JWT user data — avoids DB query on every request
// 30s ב-Production: מאזן בין performance (פחות DB queries) ל-revocation
// (block/role change ישפיע תוך 30s במקום 2 דקות).
const JWT_CACHE_TTL = 30 * 1000; // 30 שניות
interface JwtUserData {
  role: "USER" | "MANAGER" | "ADMIN" | "CLINIC_OWNER" | "CLINIC_SECRETARY";
  clinicRole: "OWNER" | "THERAPIST" | "SECRETARY" | null;
  isBlocked: boolean;
  subscriptionStatus: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED" | null;
  subscriptionEndsAt: Date | null;
  trialEndsAt: Date | null;
  passwordChangedAt: Date | null;
  // H6 (סבב אבטחה 14): מונה bump'ים שהוגדל ב-2FA enable/disable או admin block.
  // ה-jwt callback משווה ל-token.sv ומסמן sessionStale אם גדול.
  sessionVersion: number;
}
const jwtUserCache = new Map<string, { data: JwtUserData; timestamp: number }>();

/**
 * C7: ייצוא helper לביטול cache JWT עבור משתמש ספציפי.
 * נקרא אחרי שינוי passwordChangedAt/role/isBlocked כדי למנוע חלון פגיעות
 * של עד 30 שניות שבו cache עדיין מחזיק נתונים ישנים.
 */
export function invalidateJwtCache(userId: string): void {
  jwtUserCache.delete(userId);
}

// Debounce עדכוני lastActivityAt ב-DB — מונע flood של writes.
// 5 דקות = ~12 updates/שעה למשתמש פעיל.
const ACTIVITY_UPDATE_DEBOUNCE_MS = 5 * 60 * 1000;
const activityUpdateCache = new Map<string, number>();

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
                // login רגיל: רק זהות (openid email profile). הרשאת Calendar
                // (ה-scope הרגיש) נדרשת רק בעת חיבור היומן הפעיל מ-Settings,
                // דרך `/api/auth/google-calendar/connect`. לא מבקשים מהמשתמש
                // הרשאה רגישה כשהוא רק נרשם או נכנס.
                scope: "openid email profile",
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
        // H10 (סבב אבטחה 14, 2026-05-19): rightmost X-Forwarded-For. הלוגיקה
        // הקודמת לקחה את ה-leftmost (`split(",")[0]`) — IP שתוקף יכול לזייף
        // (`X-Forwarded-For: 1.2.3.4, real_ip` → "1.2.3.4" שנשלט ע"י התוקף).
        // ה-rightmost הוא ה-IP ש-Render proxy ראה בפועל. consistent עם
        // `src/lib/get-client-ip.ts:22-32`.
        const headers = req?.headers as Record<string, string | string[] | undefined> | undefined;
        const xff = headers?.["x-forwarded-for"];
        const xri = headers?.["x-real-ip"];
        const ipRaw = (Array.isArray(xff) ? xff[xff.length - 1] : xff) || (Array.isArray(xri) ? xri[xri.length - 1] : xri);
        const ip = ipRaw
          ? (() => {
              const parts = String(ipRaw).split(",").map((s) => s.trim()).filter(Boolean);
              return parts.length > 0 ? parts[parts.length - 1] : null;
            })()
          : null;
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

        // H11: account lockout — אם lockedUntil > now(), חוסמים גם אם הסיסמה
        // נכונה. ה-counter לא מתאפס על login מוצלח (counter עוסק בכשלים בלבד);
        // ה-counter מתאפס רק כאשר lockedUntil עבר ונפתח חלון חדש.
        if (user?.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error(INVALID_CREDENTIALS);
        }

        // bcrypt.compare תמיד רץ — אם user לא קיים, מול hash דמה.
        // זה מבטיח שזמן התגובה זהה לכל הנתיבים של INVALID_CREDENTIALS,
        // ומונע timing attack שמזהה אילו אימיילים רשומים.
        const hashToCompare = user?.password || (await getDummyBcryptHash());
        const isValid = await bcrypt.compare(credentials.password, hashToCompare);

        if (!user || !user.password || !isValid) {
          // H11: increment failedLoginAttempts; lock אחרי 10 כשלים ל-30 דקות.
          // נעשה fire-and-forget כדי לא להאט response לכשל login. אם הכתיבה
          // נכשלת, ה-counter לא יתעדכן הפעם — מקובל (timer בכל מקרה ינסה שוב).
          if (user) {
            const MAX_ATTEMPTS = 10;
            const LOCK_DURATION_MS = 30 * 60 * 1000;
            const newCount = (user.failedLoginAttempts ?? 0) + 1;
            const updateData: { failedLoginAttempts: number; lockedUntil?: Date } = {
              failedLoginAttempts: newCount,
            };
            if (newCount >= MAX_ATTEMPTS) {
              updateData.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
            }
            prisma.user
              .update({ where: { id: user.id }, data: updateData })
              .catch(() => { /* fire-and-forget */ });
          }
          throw new Error(INVALID_CREDENTIALS);
        }

        // H11: סיסמה נכונה — איפוס counter ו-lockedUntil. fire-and-forget.
        if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
          prisma.user
            .update({
              where: { id: user.id },
              data: { failedLoginAttempts: 0, lockedUntil: null },
            })
            .catch(() => { /* fire-and-forget */ });
        }

        // מכאן הסיסמה אומתה. בדיקות ספציפיות שמדליפות מידע על החשבון —
        // רק לאחר אימות הסיסמה (תוקף שלא יודע את הסיסמה לא יראה את ההודעות האלה).
        if (user.isBlocked) {
          throw new Error("החשבון מושבת. נא ליצור קשר עם מנהל המערכת");
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

        // 2FA: לאנשי צוות שלא היו פעילים ב-3 שעות האחרונות, מסמנים את
        // המשתמש כ-"דורש 2FA". ה-flag עובר ל-token (jwt callback) ולסשן,
        // וה-middleware מעביר ל-/auth/2fa-verify עד שיאמת.
        const needs2FA = requires2FA({
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
          lastActivityAt: user.lastActivityAt,
        });

        // loginAt = רגע ההתחברות. נשמר ב-token, וב-update flow נשווה
        // verifiedAt > loginAt — מבטיח שה-flag נמחק רק ע"י verify טרי
        // שקרה אחרי הlogin הזה (ולא מ-verifyים קודמים).
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          requires2FA: needs2FA,
          loginAt: Date.now(),
          // H6 (סבב אבטחה 14): שומרים את sessionVersion ברגע ה-login.
          // כל פעולה רגישה (2FA enable/disable, password change, admin block)
          // מגדילה את user.sessionVersion. ה-jwt callback ישווה ויסמן את
          // ה-token כ-stale אם המשתמש ביצע פעולה כזו אחרי שה-token הונפק.
          sessionVersion: user.sessionVersion ?? 0,
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
  // H16.2: session cookie — SameSite=Lax (ולא Strict).
  // Strict שובר חזרה מאתרים חיצוניים (Cardcom, לינקים ממייל) — הדפדפן
  // לא שולח את העוגיה בניווט cross-site, והמשתמש "מתנתק". Lax מגן על
  // CSRF ב-POST/PUT/DELETE (מספיק — כל הפעולות הרגישות הן POST) ומאפשר
  // ניווט GET תקין מאתרים חיצוניים. ה-`__Secure-` prefix אוכף HTTPS.
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/login",
    newUser: "/register",
    // C8: שגיאות OAuth (לרבות AccessDenied שמוחזר ע"י signIn callback)
    // יופנו ל-/login במקום עמוד NextAuth הגנרי באנגלית.
    error: "/login",
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
            // M12: console.error → logger.error (חוק 5 ב-feedback_security_fixes).
            logger.error("נכשל בהקצאת מספר משתמש", {
              userId: user.id,
              attempts: 3,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          }
          // ממתין קצרה לפני ניסיון נוסף
        }
      }
    },
    async linkAccount({ user, account }) {
      // C8: כש-NextAuth יוצר משתמש חדש דרך Google OAuth, PrismaAdapter
      // מאלץ emailVerified=null. Google מאמת אימייל בעצמו, כך שאנחנו
      // יכולים לסמן מאומת. בלי זה — login שני דרך Google ייכשל בבדיקת C8.
      if (account.provider === "google" && user.id) {
        await prisma.user
          .update({
            where: { id: user.id, emailVerified: null },
            data: { emailVerified: new Date() },
          })
          .catch(() => {
            // אם כבר מאומת (login חוזר), no-op — Prisma תזרוק; מתעלמים.
          });
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
            // C8: account takeover protection. אם משתמש קיים ב-MyTipul לא
            // אומת אימייל (emailVerified=null), אסור לקשר חשבון Google חדש
            // אוטומטית. תרחיש התקיפה: תוקף יוצר Gmail עם email של victim legacy
            // שלא אומת ב-MyTipul → Google מאשר → linking אוטומטי → תוקף נכנס
            // לחשבון של ה-victim. הפתרון: לדחות עד שה-victim יאמת את האימייל
            // דרך MyTipul (אם הוא יודע על החשבון בכלל).
            // ADMIN חריג כי תפקיד admin לרוב נוצר ידנית בלי email verification flow.
            if (!existingUser.emailVerified && existingUser.role !== "ADMIN") {
              logger.warn("[auth] blocked Google OAuth link to unverified user", {
                userId: existingUser.id,
                email: existingUser.email,
              });
              return false;
            }

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

            // Stage 2.0 — security notification: שולחים מייל למשתמש הקיים
            // שחשבון Google חדש קושר לחשבונו. הכרחי כדי שמישהו שגנב גישה לדוא"ל
            // יזהה לינקינג זדוני. fire-and-forget — כשל בשליחה לא חוסם את ההתחברות
            // (שלא נכשיל login לגיטימי בגלל בעיית שירות מייל). חסום בשבת ע"י sendEmail.
            if (existingUser.email) {
              const safeEmail = escapeHtml(existingUser.email);
              const safeName = escapeHtml(existingUser.name ?? "");
              void sendEmail({
                to: existingUser.email,
                subject: "התחברות חדשה דרך Google לחשבון שלך ב-MyTipul",
                html: `
                  <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #0f766e;">🔐 התחברות חדשה דרך Google</h2>
                    <p>שלום ${safeName},</p>
                    <p>חשבון Google חובר לחשבון שלך ב-MyTipul (${safeEmail}).</p>
                    <p style="background: #fef3c7; border-right: 4px solid #f59e0b; padding: 12px; border-radius: 6px;">
                      <strong>אם זה היה אתה</strong> — אין צורך לעשות כלום. תוכל להתחבר מעכשיו דרך Google.
                    </p>
                    <p style="background: #fee2e2; border-right: 4px solid #dc2626; padding: 12px; border-radius: 6px;">
                      <strong>אם זה לא היית אתה</strong> — שנה מיד את סיסמת ה-Gmail שלך, נתק את החיבור מהחשבון שלך ב-MyTipul,
                      ושלח לנו מייל בתשובה כדי שנבדוק את האירוע.
                    </p>
                    <p style="color: #666; font-size: 12px; margin-top: 30px;">
                      הודעה זו נשלחה אוטומטית מטעמי אבטחה.
                    </p>
                  </div>
                `,
              }).catch((err) => {
                logger.error("[auth] failed to send OAuth-link notification", {
                  userId: existingUser.id,
                  error: err instanceof Error ? err.message : String(err),
                });
              });
            }
          } else {
            // Update existing tokens — אבל **לא לדרוס** tokens קיימים אם
            // Google לא שלח אותם ב-login הזה. זה קריטי במיוחד אחרי שהוסרה
            // הרשאת Calendar מ-login הראשי: login רגיל לא יחזיר calendar
            // refresh_token, ולכן אסור לדרוס את ה-refresh_token הקיים שיש בו
            // את ההרשאה (Google לא שולחים refresh_token ב-login חוזר ללא
            // prompt=consent — זה ההתנהגות הסטנדרטית שלהם).
            await prisma.account.update({
              where: { id: existingAccount.id },
              data: {
                access_token: account.access_token ?? existingAccount.access_token,
                refresh_token: account.refresh_token ?? existingAccount.refresh_token,
                expires_at: account.expires_at ?? existingAccount.expires_at,
                id_token: account.id_token ?? existingAccount.id_token,
                // scope יכול להיצמצם בlogin חדש (calendar הוסר מהראשי) —
                // שומרים את ה-scope המקורי שכולל calendar אם היה.
                scope: account.scope ?? existingAccount.scope,
              },
            });
          }

          // Override user.id so JWT callback uses the existing user
          user.id = existingUser.id;
          user.role = existingUser.role as "USER" | "MANAGER" | "ADMIN" | "CLINIC_OWNER" | "CLINIC_SECRETARY";
        }
      }

      return true;
    },
    async jwt({ token, user, account, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        // העברת flag של 2FA אל token. אם המשתמש דורש 2FA, ה-middleware
        // ימנע ממנו גישה ל-dashboard עד שיאמת קוד ב-/auth/2fa-verify.
        const u = user as { requires2FA?: boolean; loginAt?: number; sessionVersion?: number };
        if (u.requires2FA) {
          token.requires2FA = true;
        }
        if (typeof u.loginAt === "number") {
          token.loginAt = u.loginAt;
        }
        // H6 (סבב אבטחה 14): שמירת sessionVersion ברגע ה-login. ערך זה לא
        // משתנה לאורך חיי ה-token — רק bump ב-DB גורם להפרשה ב-callback למטה.
        if (typeof u.sessionVersion === "number") {
          token.sv = u.sessionVersion;
        }

        // OAuth (Google): authorize לא רץ → flags לא הוגדרו על user.
        // טוענים את המשתמש מ-DB ומחשבים requires2FA + loginAt גם להם.
        // מבטיח ש-staff שמתחברים דרך Google גם יעברו דרך 2FA.
        if (account?.provider === "google" && !u.requires2FA && typeof u.loginAt !== "number") {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true, twoFactorEnabled: true, lastActivityAt: true, sessionVersion: true },
          });
          if (dbUser && requires2FA(dbUser)) {
            token.requires2FA = true;
          }
          token.loginAt = Date.now();
          // H6: גם ל-OAuth שומרים sessionVersion ברגע ה-login.
          token.sv = dbUser?.sessionVersion ?? 0;
        }
      }

      // Impersonation start/stop — UI קורא ל-update({ actingAs: { sessionId } | null })
      // אחרי שה-API החזיר success. **לא סומכים על שאר השדות** — נטענים מה-DB.
      // הסיבה: trigger=update מגיע מהcclient, ויכול להישלח גם דרך DevTools.
      // נטילת sessionId בלבד (שכמובן יבדק שהוא שייך ל-impersonatorId הנכון)
      // מונעת privilege escalation בו ה-client זייף actingAs.role=ADMIN.
      //
      // fail-secure: אם נשלח update עם actingAs לא תקף (sessionId זויף, DB down),
      // מוחקים את ה-actingAs הקיים גם אם היה. עדיף שהמשתמש יצטרך לבצע start
      // מחדש מאשר להישאר עם זהות לא מאומתת.
      if (trigger === "update") {
        const upd = session as { actingAs?: unknown } | undefined;
        if (upd && "actingAs" in (upd ?? {})) {
          if (upd.actingAs === null) {
            delete token.actingAs;
          } else if (upd.actingAs && typeof upd.actingAs === "object") {
            const candidate = upd.actingAs as { sessionId?: unknown };
            const sessionId =
              typeof candidate.sessionId === "string" ? candidate.sessionId : null;
            if (sessionId) {
              const verified = await loadVerifiedImpersonation(sessionId, token.id as string);
              if (verified) {
                token.actingAs = verified;
              } else {
                // לא ניתן לאמת — מוחקים כל actingAs קיים (fail-secure)
                delete token.actingAs;
              }
            } else {
              // update עם actingAs בלי sessionId תקף — דחיה
              delete token.actingAs;
            }
          }
        }
      }

      // C9: absolute max session lifetime — 30 ימים מ-loginAt. למרות
      // ש-updateAge מרענן את ה-iat כל שעה (rolling expiration), token.loginAt
      // נקבע פעם אחת ב-authorize() ולא משתנה. בלי המקסימום הזה, משתמש פעיל
      // היה נשאר מחובר לנצח. במערכת רפואית — לא מקובל.
      // legacy tokens ללא loginAt מקבלים פטור עד login הבא (אז loginAt ייקבע).
      const ABSOLUTE_MAX_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
      if (
        typeof token.loginAt === "number" &&
        Date.now() - token.loginAt > ABSOLUTE_MAX_SESSION_MS
      ) {
        token.sessionExpired = true;
      }

      // Impersonation timeout + ongoing verification — lazy check בכל קריאה.
      // מאמתים מול ה-DB שהסשן עדיין פעיל (endedAt IS NULL) ושייך ל-OWNER הנכון.
      // ככה אם cron/admin סגר את הסשן (USER_BLOCKED, TARGET_REMOVED) — ה-token
      // מתעדכן בקריאה הבאה ולא נשאר עם actingAs מיותם.
      // H4 (2026-05-17): קוצר מ-4 שעות ל-30 דקות. במערכת רפואית, חלון של 4
      // שעות על cookie גנוב = יותר מדי. cron impersonation-hardkill עדיין רץ
      // ב-DB, אבל ה-lazy check כאן הוא ההגנה הרגעית.
      if (token.actingAs) {
        const aa = token.actingAs;
        const tooOld =
          typeof aa.startedAt === "number" &&
          Date.now() - aa.startedAt > 30 * 60 * 1000;
        if (tooOld) {
          delete token.actingAs;
        } else {
          const verified = await loadVerifiedImpersonation(aa.sessionId, token.id as string);
          if (!verified) {
            delete token.actingAs;
          } else {
            // refresh שם אם השתנה (cosmetic)
            token.actingAs = verified;
          }
        }
      }

      // אחרי 2FA verify מוצלח, ה-frontend קורא ל-update() של NextAuth →
      // trigger === "update". בודקים שיש TwoFactorCode עם verifiedAt **אחרי**
      // ה-loginAt של ה-token הנוכחי. ככה הflag נמחק רק על ידי verify טרי
      // שקרה אחרי הlogin הזה (ולא מ-verifyים קודמים, login קודם, וכו').
      if (trigger === "update" && token.id && token.requires2FA && typeof token.loginAt === "number") {
        // Anti-2FA-bypass (2026-06-10): מנקים requires2FA רק אם בוצע אימות 2FA מוצלח
        // *בדיוק* עבור ה-login הזה (token.loginAt). שוויון מדויק (===), לא ">", סוגר
        // את העקיפה שבה verify שבוצע ל-login אחר (login לגיטימי של הקורבן) שיחרר token
        // חצי-מאומת ישן של תוקף. אותו check לכל 3 הנתיבים (TOTP/email-OTP/recovery) —
        // כולם חותמים את twoFactorVerifiedForLoginAt דרך verifyCode.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { twoFactorVerifiedForLoginAt: true },
        });
        if (isTwoFactorVerifiedForLogin(dbUser?.twoFactorVerifiedForLoginAt, token.loginAt)) {
          token.requires2FA = false;
        } else {
          logger.warn("[jwt] 2FA update בלי אימות תואם ל-login הזה", { userId: token.id });
        }
      }


      // עדכון lastActivityAt (debounced) — בסיס ל-2FA inactivity check.
      // לא מעדכנים אם הטוקן עדיין דורש 2FA (כדי לא ליצור חלון פטור מ-2FA לפני verify).
      if (token.id && !token.requires2FA) {
        const userId = token.id as string;
        const lastUpdate = activityUpdateCache.get(userId) || 0;
        const nowMs = Date.now();
        if (nowMs - lastUpdate >= ACTIVITY_UPDATE_DEBOUNCE_MS) {
          activityUpdateCache.set(userId, nowMs);
          // fire-and-forget — JWT callback חייב להישאר מהיר.
          prisma.user
            .update({ where: { id: userId }, data: { lastActivityAt: new Date() } })
            .catch(() => {
              // אם נכשל — מסירים מה-cache כדי לנסות שוב בקריאה הבאה
              activityUpdateCache.delete(userId);
            });
        }
      }

      // Refresh role and subscription status from database (cached for 30 seconds)
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
              clinicRole: true,
              isBlocked: true,
              subscriptionStatus: true,
              subscriptionEndsAt: true,
              trialEndsAt: true,
              passwordChangedAt: true,
              sessionVersion: true,
            },
          });
          if (dbUser) {
            jwtUserCache.set(userId, { data: dbUser, timestamp: now });
          }
        }
        if (dbUser) {
          // C7: password rotation invalidation. אם הסיסמה השתנתה אחרי
          // שהונפק ה-token (token.iat ב-seconds; passwordChangedAt ב-DB),
          // אסור להמשיך להשתמש ב-token הזה — מסמנים passwordStale.
          // ה-middleware וה-requireAuth ידחו את הבקשה.
          // הערה: כשם שה-flag הזה נכבד, ה-`iat` של NextAuth מתעדכן ב-updateAge
          // (כל שעה במצב הנוכחי), כך שאחרי login מחדש (iat חדש) הבעיה נפתרת.
          if (
            dbUser.passwordChangedAt &&
            typeof token.iat === "number" &&
            dbUser.passwordChangedAt.getTime() > token.iat * 1000
          ) {
            token.passwordStale = true;
          } else if (token.passwordStale) {
            // refresh — token חדש (iat עודכן) אחרי שינוי הסיסמה: נקה את הflag
            delete token.passwordStale;
          }

          // H6 (סבב אבטחה 14): השוואת sessionVersion. אם המשתמש ביצע פעולה
          // רגישה (2FA enable/disable, admin block) אחרי שה-token הונפק,
          // ה-DB sessionVersion יהיה גדול מ-token.sv. מסמנים sessionStale,
          // requireAuth/middleware ידחו את הבקשה. legacy tokens (sv undefined)
          // מקבלים פטור עד login הבא — תאימות אחורית.
          if (
            typeof token.sv === "number" &&
            dbUser.sessionVersion > token.sv
          ) {
            token.sessionStale = true;
          } else if (token.sessionStale) {
            // המקרה היחיד שזה מתאפס: token חדש (login מחדש) שמביא sv עדכני.
            delete token.sessionStale;
          }

          token.role = dbUser.role;
          token.clinicRole = dbUser.clinicRole ?? null;
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
        session.user.role = token.role as "USER" | "MANAGER" | "ADMIN" | "CLINIC_OWNER" | "CLINIC_SECRETARY";
        session.user.clinicRole = (token.clinicRole as "OWNER" | "THERAPIST" | "SECRETARY" | null | undefined) ?? null;
        session.user.requires2FA = token.requires2FA === true;
        session.user.passwordStale = token.passwordStale === true;
        session.user.sessionStale = token.sessionStale === true;
        session.user.sessionExpired = token.sessionExpired === true;

        // Impersonation: בעת ש-OWNER מתחזה ל-target, ה"זהות אפקטיבית"
        // היא של ה-target — ככה data scope, queries, ו-permissions זורמים
        // לחוויית ה-target. אבל שומרים את המקור ב-originalUserId כדי
        // לאפשר stop, banner, ו-audit עם זהות ה-OWNER האמיתי.
        if (token.actingAs) {
          session.user.originalUserId = token.id as string;
          session.user.actingAs = token.actingAs;
          session.user.id = token.actingAs.userId;
          session.user.role = token.actingAs.role;
          session.user.name = token.actingAs.name;
        }
      }
      return session;
    },
  },
};

// Extend NextAuth types
declare module "next-auth" {
  interface User {
    role?: "USER" | "MANAGER" | "ADMIN" | "CLINIC_OWNER" | "CLINIC_SECRETARY";
    requires2FA?: boolean;
    loginAt?: number;
    sessionVersion?: number; // H6 (סבב 14): נשמר ב-token.sv בעת login
  }

  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: "USER" | "MANAGER" | "ADMIN" | "CLINIC_OWNER" | "CLINIC_SECRETARY";
      clinicRole: "OWNER" | "THERAPIST" | "SECRETARY" | null;
      requires2FA?: boolean;
      passwordStale?: boolean; // C7: token הונפק לפני שינוי סיסמה
      sessionStale?: boolean; // H6 (סבב 14): bump של sessionVersion (2FA/admin block) → token פסול
      sessionExpired?: boolean; // C9: סשן חצה max-lifetime של 30 ימים
      // Impersonation: כש-OWNER מתחזה ל-target, ה-id/role/name מוחלפים לאלו
      // של ה-target (למניעת לחזור ולשכפל data scope), ו-originalUserId שומר
      // את ה-OWNER המקורי. actingAs מכיל את כל ה-metadata של ה-impersonation.
      originalUserId?: string;
      actingAs?: JwtActingAs;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role?: "USER" | "MANAGER" | "ADMIN" | "CLINIC_OWNER" | "CLINIC_SECRETARY";
    clinicRole?: "OWNER" | "THERAPIST" | "SECRETARY" | null;
    subscriptionStatus?: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";
    isBlocked?: boolean;
    gracePeriodEndsAt?: string; // ISO date string - מתי נגמרת תקופת החסד
    requires2FA?: boolean;
    loginAt?: number; // epoch ms — login timestamp; משמש לשיוך verify ל-token
    actingAs?: JwtActingAs; // null/undefined = לא מתחזה
    // C7: token הונפק לפני שינוי סיסמה — אסור להשתמש בו.
    // middleware/requireAuth דוחים בקשות עם passwordStale=true.
    passwordStale?: boolean;
    // H6 (סבב 14): sessionVersion שנשמר בעת login. השוואה ל-user.sessionVersion
    // הנוכחי ב-jwt callback קובעת אם ה-token התיישן (sessionStale).
    sv?: number;
    // H6: ה-DB עבר bump של sessionVersion (2FA enable/disable, admin block)
    // אחרי שה-token הונפק. middleware/requireAuth דוחים.
    sessionStale?: boolean;
    // C9: session חצה את ה-absolute max lifetime (30 ימים).
    // middleware/requireAuth דוחים ומאלצים login מחדש.
    sessionExpired?: boolean;
  }
}
