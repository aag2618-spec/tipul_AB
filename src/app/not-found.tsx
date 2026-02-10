import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 px-4">
        <div className="text-8xl font-bold text-muted-foreground/30">404</div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">הדף לא נמצא</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            הדף שחיפשת לא קיים או שהוסר. אנא בדוק את הכתובת ונסה שוב.
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <Link 
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            חזרה לדשבורד
          </Link>
          <Link 
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            דף הבית
          </Link>
        </div>
      </div>
    </div>
  );
}
