import Link from "next/link";

export default function ClientNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4" dir="rtl">
      <h2 className="text-xl font-semibold">המטופל לא נמצא</h2>
      <p className="text-muted-foreground">
        לא הצלחנו לטעון את כרטיס המטופל. ייתכן שמדובר בשגיאה זמנית.
      </p>
      <div className="flex gap-3">
        <Link
          href="/dashboard/clients"
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          חזרה לרשימת מטופלים
        </Link>
      </div>
    </div>
  );
}
