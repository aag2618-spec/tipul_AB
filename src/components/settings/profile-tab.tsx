"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  license: string;
}

export function ProfileTab() {
  const [profile, setProfile] = useState<UserProfile>({
    name: "",
    email: "",
    phone: "",
    license: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch("/api/user/profile");
        if (response.ok) {
          const data = await response.json();
          setProfile({
            name: data.name || "",
            email: data.email || "",
            phone: data.phone || "",
            license: data.license || "",
          });
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw new Error();
      toast.success("הפרופיל עודכן בהצלחה");
    } catch {
      toast.error("שגיאה בעדכון הפרופיל");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[30vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>פרטים אישיים</CardTitle>
          <CardDescription>עדכן את הפרטים האישיים שלך - פרטים אלו משמשים לזיהוי ולתקשורת עם המטופלים</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">שם מלא</Label>
            <p className="text-xs text-muted-foreground">השם שיוצג למטופלים במיילים, בקבלות ובמסמכים</p>
            <Input
              id="name"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">אימייל</Label>
            <p className="text-xs text-muted-foreground">כתובת המייל לקבלת התראות, תזכורות ותקשורת עם מטופלים</p>
            <Input
              id="email"
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              disabled={isSaving}
              dir="ltr"
              className="text-left"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">טלפון</Label>
              <p className="text-xs text-muted-foreground">מספר הטלפון שיופיע בקבלות ובמסמכים</p>
              <Input
                id="phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                disabled={isSaving}
                dir="ltr"
                className="text-left"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="license">מספר רישיון</Label>
              <p className="text-xs text-muted-foreground">מספר רישיון מקצועי (לתיעוד רגולטורי)</p>
              <Input
                id="license"
                value={profile.license}
                onChange={(e) => setProfile({ ...profile, license: e.target.value })}
                disabled={isSaving}
                dir="ltr"
                className="text-left"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSaving} size="lg" className="gap-2">
          {isSaving ? (
            <><Loader2 className="h-5 w-5 animate-spin" />שומר...</>
          ) : (
            <><Save className="h-5 w-5" />שמור</>
          )}
        </Button>
      </div>

      <Separator />

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">אזור מסוכן</CardTitle>
          <CardDescription>פעולות בלתי הפיכות - לא ניתן לשחזר נתונים לאחר מחיקה</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" disabled>מחק חשבון</Button>
        </CardContent>
      </Card>
    </form>
  );
}
