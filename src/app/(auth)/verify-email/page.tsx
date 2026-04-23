import Link from "next/link";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { ResendVerificationForm } from "./resend-form";

export const dynamic = "force-dynamic";

type VerifyState = "success" | "expired" | "invalid" | "missing" | "error";

async function verifyToken(token: string | undefined): Promise<VerifyState> {
  if (!token) return "missing";

  try {
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: token },
      select: {
        id: true,
        emailVerified: true,
        emailVerificationExpires: true,
      },
    });

    if (!user) return "invalid";

    if (user.emailVerified) return "success";

    if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      return "expired";
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return "success";
  } catch (error) {
    logger.error("Email verification page error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "error";
  }
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const state = await verifyToken(token);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/20 p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent" />

      <Card className="w-full max-w-md animate-fade-in relative text-center">
        {state === "success" && (
          <>
            <CardHeader className="space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">החשבון אומת בהצלחה!</CardTitle>
                <CardDescription className="mt-3 text-base leading-relaxed">
                  כתובת המייל שלך אושרה. אפשר להתחבר ולהתחיל להשתמש במערכת.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 text-sm text-green-700 dark:text-green-300">
                14 ימי ניסיון חינם במסלול Pro מחכים לך
              </div>
            </CardContent>
            <CardFooter>
              <Button asChild className="w-full">
                <Link href="/login?verified=true">התחבר עכשיו</Link>
              </Button>
            </CardFooter>
          </>
        )}

        {(state === "expired" || state === "invalid") && (
          <>
            <CardHeader className="space-y-4">
              <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">
                  {state === "expired" ? "הקישור פג תוקף" : "הקישור לא תקין"}
                </CardTitle>
                <CardDescription className="mt-3 text-base leading-relaxed">
                  {state === "expired"
                    ? "קישור האימות תקף ל-24 שעות בלבד. נא לבקש קישור חדש."
                    : "הקישור שגוי או כבר נעשה בו שימוש. נא לבקש קישור אימות חדש."}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ResendVerificationForm />
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">חזרה להתחברות</Link>
              </Button>
            </CardFooter>
          </>
        )}

        {state === "missing" && (
          <>
            <CardHeader className="space-y-4">
              <div className="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">קישור אימות חסר</CardTitle>
                <CardDescription className="mt-3 text-base leading-relaxed">
                  כדי לאמת את החשבון, יש להשתמש בקישור שנשלח אלייך במייל.
                </CardDescription>
              </div>
            </CardHeader>
            <CardFooter className="flex flex-col gap-2">
              <Button asChild className="w-full">
                <Link href="/register">חזרה להרשמה</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">יש לי כבר חשבון</Link>
              </Button>
            </CardFooter>
          </>
        )}

        {state === "error" && (
          <>
            <CardHeader className="space-y-4">
              <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold">שגיאה באימות</CardTitle>
                <CardDescription className="mt-3 text-base leading-relaxed">
                  אירעה שגיאה בעת אימות החשבון. נא לנסות שוב מאוחר יותר.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ResendVerificationForm />
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">חזרה להתחברות</Link>
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
