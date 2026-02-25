"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Bell, Link2, Building2 } from "lucide-react";
import { Loader2 } from "lucide-react";
import { ProfileTab } from "@/components/settings/profile-tab";
import { NotificationsTab } from "@/components/settings/notifications-tab";
import { ConnectionsTab } from "@/components/settings/connections-tab";
import { BusinessTab } from "@/components/settings/business-tab";

function SettingsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "profile";
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הגדרות</h1>
        <p className="text-muted-foreground">ניהול הגדרות החשבון והפרקטיקה</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="w-full justify-start h-auto flex-wrap gap-1 bg-transparent p-0 border-b rounded-none">
          <TabsTrigger
            value="profile"
            className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-t-lg rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            <User className="h-4 w-4" />
            פרופיל
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-t-lg rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            <Bell className="h-4 w-4" />
            התראות ותקשורת
          </TabsTrigger>
          <TabsTrigger
            value="connections"
            className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-t-lg rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            <Link2 className="h-4 w-4" />
            חיבורים
          </TabsTrigger>
          <TabsTrigger
            value="business"
            className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-t-lg rounded-b-none border-b-2 border-transparent data-[state=active]:border-primary"
          >
            <Building2 className="h-4 w-4" />
            עסק וקבלות
          </TabsTrigger>
        </TabsList>

        <div className="pt-6">
          <TabsContent value="profile" className="mt-0">
            <ProfileTab />
          </TabsContent>
          <TabsContent value="notifications" className="mt-0">
            <NotificationsTab />
          </TabsContent>
          <TabsContent value="connections" className="mt-0">
            <ConnectionsTab />
          </TabsContent>
          <TabsContent value="business" className="mt-0">
            <BusinessTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
