import { promises as fs } from "fs";
import path from "path";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import {
  LEGAL_DOCS,
  LEGAL_DOC_LIST,
  LEGAL_DRAFT_DISCLAIMER,
  type LegalDocSlug,
  type LegalDocMeta,
} from "@/lib/legal/versions";
import { SiteFooter } from "@/components/site-footer";

// Stage 6-A — תיקון רגרסיה: ה-SiteFooter מקשר ל-/legal/* אבל בלי route
// המשתמש מקבל 404. הדף הזה קורא את קובץ ה-md המתאים מ-`legal/<slug>.md`
// ומציג אותו דרך react-markdown.
//
// סטטי לחלוטין: SSG עם generateStaticParams. אם נוסיף slug חדש ל-LEGAL_DOCS
// ונבנה — Next.js ייצר את הדף אוטומטית.

export const dynamic = "force-static";

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return LEGAL_DOC_LIST.map((doc) => ({ slug: doc.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = (LEGAL_DOCS as Record<string, LegalDocMeta>)[slug];
  if (!doc) return { title: "מסמך משפטי" };
  return {
    title: `${doc.title} — MyTipul`,
    description: doc.shortTitle,
    robots: { index: true, follow: true },
  };
}

async function readLegalContent(filePath: string): Promise<string | null> {
  try {
    const absolute = path.join(process.cwd(), filePath);
    return await fs.readFile(absolute, "utf-8");
  } catch {
    return null;
  }
}

export default async function LegalDocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = (LEGAL_DOCS as Record<string, LegalDocMeta>)[slug as LegalDocSlug];

  if (!doc) notFound();

  const content = await readLegalContent(doc.filePath);
  if (!content) notFound();

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <header className="border-b py-4 bg-card">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← חזרה לעמוד הבית
          </Link>
          <span className="text-xs text-muted-foreground">
            גרסה {doc.version} · בתוקף מ-{doc.effectiveDate}
          </span>
        </div>
      </header>

      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4 mb-6 text-sm text-amber-300">
            <strong>שים/י לב:</strong> {LEGAL_DRAFT_DISCLAIMER}
          </div>

          <article className="prose prose-invert prose-sm md:prose-base max-w-none">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h1 className="text-2xl md:text-3xl font-bold mt-6 mb-4">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl md:text-2xl font-semibold mt-6 mb-3">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="leading-relaxed mb-3">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pr-5 mb-3 space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pr-5 mb-3 space-y-1">{children}</ol>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-r-4 border-amber-500/50 bg-amber-500/5 pr-4 py-2 my-3 italic">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="bg-muted/60 px-1.5 py-0.5 rounded text-xs">
                    {children}
                  </code>
                ),
                a: ({ children, href }) => (
                  <a href={href} className="text-primary hover:underline">
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
