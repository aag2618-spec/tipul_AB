import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/site-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { WorksheetsShowcase } from "@/components/landing/worksheets-showcase";
import { FeaturesGrid } from "@/components/landing/features-grid";
import { ClinicFeatures } from "@/components/landing/clinic-features";
import { PricingSection } from "@/components/landing/pricing-section";
import { SecuritySection } from "@/components/landing/security-section";
import { ContactForm } from "@/components/landing/contact-form";
import { Reveal } from "@/components/landing/reveal";

const TRUST_STATS = [
  { stat: "18+", label: "גישות טיפוליות" },
  { stat: "20+", label: "שאלונים מקצועיים" },
  { stat: "SMS + מייל", label: "תזכורות אוטומטיות" },
  { stat: "AES-256", label: "אבטחת מידע" },
];

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  // הגדרות התצוגה של דף הנחיתה — נשלטות מ-/admin/billing/landing-settings.
  const s = await getSiteSettings([
    "landing_private_price",
    "landing_price_note",
    "landing_price_visible",
  ]);
  const privatePrice = (s.landing_private_price as string | undefined) ?? "";
  const priceNote = (s.landing_price_note as string | undefined) ?? "";
  const priceVisible = (s.landing_price_visible as boolean | undefined) ?? false;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10">
      <LandingNavbar />

      <main>
        <LandingHero />

        {/* רצועת אמון */}
        <section className="border-y bg-card/50">
          <div className="container mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {TRUST_STATS.map((item) => (
              <div key={item.label}>
                <div className="text-2xl md:text-3xl font-bold text-primary">{item.stat}</div>
                <div className="text-sm text-muted-foreground mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        <WorksheetsShowcase />
        <FeaturesGrid />
        <ClinicFeatures />
        <PricingSection
          privatePrice={privatePrice}
          priceNote={priceNote}
          priceVisible={priceVisible}
        />
        <SecuritySection />

        {/* צרו קשר */}
        <section id="contact" className="py-20">
          <div className="container mx-auto px-4 max-w-2xl">
            <Reveal className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">מנהלים קליניקה? דברו איתנו</h2>
              <p className="text-muted-foreground text-lg">
                השאירו פרטים ונחזור אליכם להתאמת מסלול אישי לפי גודל הקליניקה והצרכים שלכם.
              </p>
            </Reveal>
            <Reveal delay={100}>
              <ContactForm />
            </Reveal>
          </div>
        </section>

        {/* CTA סופי */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <Reveal className="max-w-3xl mx-auto text-center rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-10 md:p-14">
              <h2 className="text-2xl md:text-4xl font-bold mb-4">
                מוכנים לנהל את הפרקטיקה בצורה חכמה יותר?
              </h2>
              <p className="text-primary-foreground/90 text-lg mb-8 max-w-xl mx-auto">
                הצטרפו למטפלים שכבר חוסכים זמן ומנהלים הכול ממקום אחד. 14 ימי ניסיון חינם — ללא כרטיס אשראי.
              </p>
              <Button size="lg" variant="secondary" className="text-base px-8 h-12" asChild>
                <Link href="/register">התחל תקופת ניסיון חינם</Link>
              </Button>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
