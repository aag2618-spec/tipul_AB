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
  morningTime: string;
  eveningTime: string;
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
        <p className="text-xs text-muted-foreground bg-primary/5 rounded-lg p-3 border border-primary/10">
          ההגדרות כאן הן <strong>עבורך בלבד</strong> — סיכומים יומיים ותזכורות שמגיעים אליך בפעמון ובמייל. הגדרות של מיילים למטופלים נמצאות בלשונית &quot;מיילים אוטומטיים&quot; למטה.
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">סיכום יומי במייל</p>
              <p className="text-sm text-muted-foreground">קבל סיכום יומי של פגישות ומשימות ישירות למייל שלך (בנוסף לפעמון במערכת)</p>
            </div>
          </div>
          <Switch
            checked={notifSettings.emailEnabled}
            onCheckedChange={(checked) => setNotifSettings({ ...notifSettings, emailEnabled: checked })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2 rounded-lg bg-muted/40 p-3">
            <Label>שעת סיכום בוקר</Label>
            <p className="text-xs text-muted-foreground">רשימת הפגישות שלך להיום + תזכורת על תשלומים ממתינים (פעמון + מייל)</p>
            <Input
              type="time"
              value={notifSettings.morningTime}
              onChange={(e) => {
                const val = e.target.value || "08:00";
                const [h, m] = val.split(":").map(Number);
                if (h < 5 || h > 12 || (h === 12 && m > 0)) {
                  setNotifSettings({ ...notifSettings, morningTime: "08:00" });
                } else {
                  setNotifSettings({ ...notifSettings, morningTime: val });
                }
              }}
              onBlur={() => {
                const [h, m] = notifSettings.morningTime.split(":").map(Number);
                if (h < 5 || h > 12 || (h === 12 && m > 0)) {
                  setNotifSettings({ ...notifSettings, morningTime: "08:00" });
                }
              }}
              className="w-28"
              min="05:00"
              max="12:00"
            />
          </div>
          <div className="space-y-2 rounded-lg bg-muted/40 p-3">
            <Label>שעת סיכום ערב</Label>
            <p className="text-xs text-muted-foreground">רשימת פגישות מחר + פגישות בלי סיכום + משימות פתוחות (גבייה, מטלות אישיות ועוד) — פעמון + מייל</p>
            <Input
              type="time"
              value={notifSettings.eveningTime}
              onChange={(e) => {
                const val = e.target.value || "20:00";
                const [h, m] = val.split(":").map(Number);
                if (h < 16 || h > 23 || (h === 23 && m > 0)) {
                  setNotifSettings({ ...notifSettings, eveningTime: "20:00" });
                } else {
                  setNotifSettings({ ...notifSettings, eveningTime: val });
                }
              }}
              onBlur={() => {
                const [h, m] = notifSettings.eveningTime.split(":").map(Number);
                if (h < 16 || h > 23 || (h === 23 && m > 0)) {
                  setNotifSettings({ ...notifSettings, eveningTime: "20:00" });
                }
              }}
              className="w-28"
              min="16:00"
              max="23:00"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>ימים לתזכורת חוב</Label>
            <p className="text-xs text-muted-foreground">אחרי כמה ימים ללא תשלום תקבל התראה בפעמון על חוב פתוח</p>
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
            <Label>יום גבייה חודשי</Label>
            <p className="text-xs text-muted-foreground">באיזה יום בחודש לקבל תזכורת בפעמון שהיום יום גבייה (תזכורת לך — לא נשלח מייל למטופלים)</p>
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
