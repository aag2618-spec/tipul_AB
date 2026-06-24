import Link from "next/link";
import { Check, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

interface PricingSectionProps {
  privatePrice: string;
  priceNote: string;
  priceVisible: boolean;
}

const PRIVATE_INCLUDES = [
  "ניהול מטופלים, יומן ותשלומים",
  "כל ספריית דפי העבודה והשאלונים",
  "תזכורות SMS ומייל אוטומטיות",
  "זימון עצמי וקבלות דיגיטליות",
];

const CLINIC_INCLUDES = [
  "כל מה שכלול במסלול מטפל פרטי",
  "ניהול צוות מטפלים ומזכירות",
  "יומן רב-מטפלים וניהול חדרים",
  "אנליטיקה, מטלות וצ'אט צוות",
];

// שני המסלולים. המחיר של "מטפל פרטי" מגיע מ-SiteSetting (נשלט מהניהול);
// כל עוד priceVisible כבוי או המחיר ריק — מוצג "פנו לפרטים".
export function PricingSection({ privatePrice, priceNote, priceVisible }: PricingSectionProps) {
  const showPrice = priceVisible && privatePrice.trim() !== "";

  return (
    <section id="pricing" className="py-20">
      <div className="container mx-auto px-4">
        <Reveal className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">בחרו את המסלול שלכם</h2>
          <p className="text-muted-foreground text-lg">
            מטפל פרטי או קליניקה עם צוות — לכל אחד מה שהוא צריך
          </p>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto items-stretch">
          {/* מטפל פרטי */}
          <Reveal>
            <div className="relative h-full flex flex-col p-7 rounded-2xl bg-card border-2 border-primary shadow-md">
              <span className="absolute -top-3 right-6 text-xs font-medium bg-primary text-primary-foreground rounded-full px-3 py-1">
                הכי נפוץ
              </span>
              <div className="flex items-center gap-2 mb-3">
                <User className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-bold">מטפל פרטי</h3>
              </div>
              {showPrice ? (
                <div className="mb-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold">{privatePrice}</span>
                    <span className="text-muted-foreground">/ חודש</span>
                  </div>
                  {priceNote.trim() !== "" && (
                    <p className="text-sm text-primary font-medium mt-1">{priceNote}</p>
                  )}
                </div>
              ) : (
                <div className="mb-1">
                  <span className="text-2xl font-bold">פנו לפרטים</span>
                  <p className="text-sm text-muted-foreground mt-1">
                    14 ימי ניסיון חינם, ללא כרטיס אשראי
                  </p>
                </div>
              )}
              <ul className="mt-5 space-y-2.5 flex-1">
                {PRIVATE_INCLUDES.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button size="lg" className="mt-6 w-full" asChild>
                <Link href="/register">התחל 14 ימי ניסיון</Link>
              </Button>
            </div>
          </Reveal>

          {/* קליניקה */}
          <Reveal delay={100}>
            <div className="h-full flex flex-col p-7 rounded-2xl bg-card border shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-bold">קליניקה / מרכז טיפולי</h3>
              </div>
              <div className="mb-1">
                <span className="text-2xl font-bold">לפי גודל הקליניקה</span>
                <p className="text-sm text-muted-foreground mt-1">
                  תמחור אישי לפי מספר המטפלים והצרכים
                </p>
              </div>
              <ul className="mt-5 space-y-2.5 flex-1">
                {CLINIC_INCLUDES.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button size="lg" variant="outline" className="mt-6 w-full" asChild>
                <Link href="#contact">צרו קשר</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
