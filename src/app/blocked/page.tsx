"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AppLogo } from "@/components/app-logo";
import { ShieldAlert } from "lucide-react";

export default function BlockedPage() {
  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-accent/20 p-4"
    >
      <Card className="w-full max-w-md animate-fade-in">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto flex justify-center">
            <AppLogo width={344} height={192} className="h-14 w-auto object-contain" priority />
          </div>
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 p-3">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">החשבון מושבת</CardTitle>
            <CardDescription className="mt-2">
              הגישה לחשבון שלך הושבתה זמנית
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              ייתכן שהחשבון הושבת באחת מהסיבות הבאות:
            </p>
            <ul className="list-disc list-inside space-y-1 pr-4">
              <li>חוב פתוח על המנוי</li>
              <li>הפרת תנאי השימוש</li>
              <li>השבתה זמנית על ידי המנהל</li>
            </ul>
            <p className="pt-2">
              אם נדמה לך שזו טעות — נא ליצור קשר עם התמיכה.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href="/dashboard/settings/billing">
              לדף התשלומים והמנוי
            </Link>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            התנתקות
          </Button>

          <p className="text-xs text-muted-foreground text-center pt-2">
            תמיכה: support@mytipul.app
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
