"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error.digest ?? "no-digest");
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-destructive">שגיאה</h1>
          <p className="text-xl text-muted-foreground">משהו השתבש</p>
        </div>
        
        <div className="bg-muted p-4 rounded-lg text-sm text-right">
          <p>אירעה שגיאה בלתי צפויה. אם הבעיה חוזרת, שלח את מזהה השגיאה לתמיכה.</p>
          {error.digest && (
            <p className="text-xs text-muted-foreground mt-2 font-mono" dir="ltr">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <Button onClick={() => reset()}>נסה שוב</Button>
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/")}
          >
            חזור לדף הבית
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          אם הבעיה ממשיכה, אנא צור קשר עם התמיכה
        </p>
      </div>
    </div>
  );
}
