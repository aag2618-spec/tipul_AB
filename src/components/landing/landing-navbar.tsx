"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLogo } from "@/components/app-logo";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#worksheets", label: "דפי עבודה" },
  { href: "#features", label: "פיצ'רים" },
  { href: "#pricing", label: "מסלולים" },
  { href: "#contact", label: "צרו קשר" },
];

// סרגל ניווט עליון קבוע. שקוף מעל ה-hero, הופך ל-glass מטושטש בגלילה.
export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-all",
        scrolled
          ? "bg-background/70 backdrop-blur-md border-b shadow-sm"
          : "bg-transparent"
      )}
    >
      <nav
        aria-label="ניווט ראשי"
        className="container mx-auto px-4 h-16 flex items-center justify-between"
      >
        <Link href="#hero" className="flex items-center shrink-0" aria-label="MyTipul">
          <AppLogo className="h-10 w-auto" />
        </Link>

        {/* קישורים — דסקטופ */}
        <div className="hidden md:flex items-center gap-7 text-sm">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* פעולות — דסקטופ */}
        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" asChild>
            <Link href="/login">התחברות</Link>
          </Button>
          <Button asChild>
            <Link href="/register">התחל ניסיון</Link>
          </Button>
        </div>

        {/* כפתור תפריט — מובייל */}
        <button
          type="button"
          className="md:hidden p-2 -me-2 text-foreground"
          aria-label={menuOpen ? "סגור תפריט" : "פתח תפריט"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* תפריט מובייל */}
      {menuOpen && (
        <div className="md:hidden border-t bg-background/95 backdrop-blur-md">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-3">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="py-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" asChild>
                <Link href="/login" onClick={() => setMenuOpen(false)}>
                  התחברות
                </Link>
              </Button>
              <Button className="flex-1" asChild>
                <Link href="/register" onClick={() => setMenuOpen(false)}>
                  התחל ניסיון
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
