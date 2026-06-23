"use client";

// src/components/billing/clinic-upgrade-card.tsx
// בלוק "שדרוג לקליניקה — MyTipul Extra" בדף החיוב. מסביר למי מיועד מסלול
// הקליניקה ומה התועלת, עם קישור לפנייה לתמיכה. אינו מבצע רכישה — רק פנייה.
// מוצג למטפל עצמאי בלבד (לא לחבר/ת קליניקה קיימים).

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Percent,
  ReceiptText,
  BarChart3,
  Headphones,
  CalendarRange,
  ClipboardCheck,
  DoorOpen,
  ArrowLeftRight,
  UserMinus,
  MessagesSquare,
  Wallet,
  Check,
} from "lucide-react";

// שלושת "הקלפים החזקים" — היכולות שהכי משכנעות לעבור לקליניקה.
const HIGHLIGHTS = [
  {
    icon: Percent,
    title: "חלוקת הכנסות באחוזים",
    desc: "אחוז קבוע לכל מטפל — החלוקה מחושבת אוטומטית",
  },
  {
    icon: ReceiptText,
    title: "דוח הכנסות חודשי",
    desc: "כמה כל מטפל הכניס וכמה לקליניקה",
  },
  {
    icon: BarChart3,
    title: "סטטיסטיקות ועומסים",
    desc: "אי-הגעות, ביטולים ועומס לכל מטפל",
  },
] as const;

// יתרונות נוספים של מסלול הקליניקה.
const BENEFITS = [
  { icon: Headphones, text: "מוקד קבלה למזכירה — קביעות וגבייה" },
  { icon: CalendarRange, text: "יומן אישי לכל מטפל + תצוגה מרכזית למנהלת" },
  { icon: ClipboardCheck, text: "מטלות צוות — הקצאה ומעקב ביצוע" },
  { icon: DoorOpen, text: "ניהול חדרים וקביעה מקבילה" },
  { icon: ArrowLeftRight, text: "העברת מטופלים בין מטפלים" },
  { icon: UserMinus, text: "תהליכי עזיבה מסודרים" },
  { icon: MessagesSquare, text: "צ׳אט צוות + מעקב שיחות" },
  { icon: Wallet, text: "חיוב מרוכז — הקליניקה משלמת על המטפלים" },
] as const;

export function ClinicUpgradeCard() {
  return (
    <Card className="border-2 border-primary/30">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          מנהלים קליניקה עם כמה מטפלים?
          <span className="text-sm font-semibold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full tracking-wide">
            MyTipul Extra
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          מסלול <span dir="ltr">MyTipul Extra</span> נבנה לבעלי קליניקה שמעסיקים
          מספר מטפלים ומזכירה אחת או יותר — לנהל את כל הצוות, הכספים והנתונים
          במקום אחד, בלי בלגן ובלי כפילויות.
        </p>

        {/* שלושת הקלפים החזקים */}
        <div className="grid gap-3 sm:grid-cols-3">
          {HIGHLIGHTS.map((h) => {
            const Icon = h.icon;
            return (
              <div key={h.title} className="p-3 bg-primary/5 rounded-lg">
                <Icon className="h-5 w-5 text-primary" />
                <div className="text-sm font-medium mt-1.5">{h.title}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {h.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* יתרונות נוספים */}
        <div className="grid gap-2 sm:grid-cols-2">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.text} className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 text-primary shrink-0" />
                {b.text}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
          <Button asChild>
            <Link href="/dashboard/support">
              <Headphones className="h-4 w-4 ml-1" />
              דברו איתנו על מסלול קליניקה
            </Link>
          </Button>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Check className="h-3 w-3" />
            פנייה לתמיכה — נחזור אליכם עם התאמה ותמחור
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
