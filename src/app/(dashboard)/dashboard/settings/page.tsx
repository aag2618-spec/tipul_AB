"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Save, User, Bell, Shield, Mail, Link as LinkIcon, MessageSquare, Calendar, FileText, Building2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  license: string;
  defaultSessionDuration: number;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile>({
    name: "",
    email: "",
    phone: "",
    license: "",
    defaultSessionDuration: 50,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const calendarSettingsRef = useRef<HTMLDivElement>(null);

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
            defaultSessionDuration: data.defaultSessionDuration || 50,
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

  const scrollToCalendarSettings = () => {
    setActiveTab("calendar");
    calendarSettingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
        <Button 
          variant={activeTab === "profile" ? "default" : "outline"} 
          size="sm" 
          className="gap-2"
          onClick={() => setActiveTab("profile")}
        >
          <User className="h-4 w-4" />
          פרופיל
        </Button>
        <Button 
          variant={activeTab === "calendar" ? "default" : "outline"} 
          size="sm" 
          className="gap-2"
          onClick={scrollToCalendarSettings}
        >
          <Calendar className="h-4 w-4" />
          הגדרות יומן
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
          <Link href="/dashboard/settings/questionnaires">
            <FileText className="h-4 w-4" />
            שאלונים
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/integrations">
            <LinkIcon className="h-4 w-4" />
            אינטגרציות
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/sms">
            <MessageSquare className="h-4 w-4" />
            תזכורות SMS
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/business">
            <Building2 className="h-4 w-4" />
            עסק וקבלות
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="gap-2">
          <Shield className="h-4 w-4" />
          אבטחה
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* פרטים אישיים */}
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

        {/* הגדרות יומן ופגישות */}
        <Card 
          ref={calendarSettingsRef}
          className="border-primary/20 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 scroll-mt-6"
        >
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle>הגדרות יומן ופגישות</CardTitle>
            </div>
            <CardDescription>
              הגדרות כלליות החלות על כל היומן וכל הפגישות עם כלל המטופלים
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sessionDuration" className="text-base font-semibold">
                משך זמן ברירת מחדל לפגישה
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="sessionDuration"
                  type="number"
                  min="15"
                  max="180"
                  step="5"
                  value={profile.defaultSessionDuration}
                  onChange={(e) => setProfile({ ...profile, defaultSessionDuration: parseInt(e.target.value) || 50 })}
                  disabled={isSaving}
                  className="max-w-[120px] text-lg font-semibold"
                />
                <span className="text-muted-foreground">דקות</span>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  ⏱️ זהו משך הזמן שיוגדר אוטומטית לכל פגישה חדשה שתיצור ביומן, עבור כל המטופלים.
                  <br />
                  <span className="font-semibold">מומלץ: 45-50 דקות</span> (משך טיפול סטנדרטי)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving} size="lg" className="gap-2">
            {isSaving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                שומר שינויים...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                שמור את כל ההגדרות
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













