"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" dir="rtl">
      <h2 className="text-xl font-semibold">משהו השתבש</h2>
      <p className="text-muted-foreground">אירעה שגיאה בלתי צפויה</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        נסה שוב
      </button>
    </div>
  );
}
