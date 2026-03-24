"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail } from "lucide-react";
import {
  AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

interface NotificationSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
  debtThresholdDays: number;
  monthlyReminderDay: number | null;
}

interface NotificationChannelsSectionProps {
  notifSettings: NotificationSettings;
  setNotifSettings: React.Dispatch<React.SetStateAction<NotificationSettings>>;
}

export function NotificationChannelsSection({
  notifSettings,
  setNotifSettings,
}: NotificationChannelsSectionProps) {
  return (
    <AccordionItem value="notifications" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <span className="font-semibold">התראות</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">אימייל</p>
              <p className="text-sm text-muted-foreground">קבל סיכום יומי של פגישות ומשימות להיום ולמחר</p>
            </div>
          </div>
          <Switch
            checked={notifSettings.emailEnabled}
            onCheckedChange={(checked) => setNotifSettings({ ...notifSettings, emailEnabled: checked })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 rounded-lg bg-muted/40 p-3">
            <Label>תזכורת בוקר</Label>
            <p className="text-sm font-medium">08:00</p>
            <p className="text-xs text-muted-foreground">סיכום הפגישות של היום</p>
          </div>
          <div className="space-y-1 rounded-lg bg-muted/40 p-3">
            <Label>תזכורת ערב</Label>
            <p className="text-sm font-medium">20:00</p>
            <p className="text-xs text-muted-foreground">תזכורת על פגישות מחר ומשימות פתוחות</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>ימים לתזכורת חוב</Label>
            <p className="text-xs text-muted-foreground">אחרי כמה ימים ללא תשלום תקבל התראה על חוב פתוח</p>
            <Input
              type="number"
              min={1}
              max={90}
              value={notifSettings.debtThresholdDays}
              onChange={(e) => setNotifSettings({ ...notifSettings, debtThresholdDays: parseInt(e.target.value) || 30 })}
              className="w-24"
            />
          </div>
          <div className="space-y-2">
            <Label>תזכורת גבייה חודשית (יום)</Label>
            <p className="text-xs text-muted-foreground">באיזה יום בחודש לקבל תזכורת לגבות חובות פתוחים</p>
            <Input
              type="number"
              min={1}
              max={31}
              value={notifSettings.monthlyReminderDay || ""}
              onChange={(e) => setNotifSettings({ ...notifSettings, monthlyReminderDay: e.target.value ? parseInt(e.target.value) : null })}
              className="w-24"
              placeholder="--"
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
