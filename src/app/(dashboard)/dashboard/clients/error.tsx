"use client";

import { useEffect } from "react";

export default function ClientsError({
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-lg text-sm text-right" dir="ltr">
        <p className="font-mono break-all text-red-700">{error.message || "Unknown error"}</p>
        {error.digest && (
          <p className="text-xs text-red-400 mt-1">Digest: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        נסה שוב
      </button>
    </div>
  );
}
