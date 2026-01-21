"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, User, Bell, Shield, Mail, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  license: string;
}

export default function SettingsPage() {
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
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הגדרות</h1>
        <p className="text-muted-foreground">ניהול הגדרות החשבון והפרקטיקה</p>
      </div>

      {/* Navigation */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="default" size="sm" className="gap-2">
          <User className="h-4 w-4" />
          פרופיל
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/notifications">
            <Bell className="h-4 w-4" />
            התראות
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/communication">
            <Mail className="h-4 w-4" />
            תקשורת וביטולים
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/integrations">
            <LinkIcon className="h-4 w-4" />
            אינטגרציות
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="gap-2">
          <Shield className="h-4 w-4" />
          אבטחה
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>פרטים אישיים</CardTitle>
            <CardDescription>עדכן את הפרטים האישיים שלך</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">שם מלא</Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">אימייל</Label>
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

        <div className="flex justify-end mt-6">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Save className="ml-2 h-4 w-4" />
                שמור שינויים
              </>
            )}
          </Button>
        </div>
      </form>

      <Separator />

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">אזור מסוכן</CardTitle>
          <CardDescription>
            פעולות בלתי הפיכות - יש להיזהר
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" disabled>
            מחק חשבון
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}













