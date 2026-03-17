"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare } from "lucide-react";
import {
  AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

interface SMSSettings {
  enabled: boolean;
  hoursBeforeReminder: number;
  customMessage: string | null;
  sendOnWeekends: boolean;
}

interface SmsSectionProps {
  smsSettings: SMSSettings;
  setSmsSettings: React.Dispatch<React.SetStateAction<SMSSettings>>;
}

export function SmsSection({
  smsSettings,
  setSmsSettings,
}: SmsSectionProps) {
  const defaultSmsMessage = `שלום {שם},\nזוהי תזכורת לפגישה שלך ב{תאריך} בשעה {שעה}.\nתודה!`;

  return (
    <AccordionItem value="sms" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="font-semibold">תזכורות SMS</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${smsSettings.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {smsSettings.enabled ? "פעיל" : "כבוי"}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>הפעל תזכורות SMS</Label>
            <p className="text-xs text-muted-foreground">שלח הודעת SMS אוטומטית למטופלים לפני הפגישה (בימים א&apos;-ה&apos; בלבד)</p>
          </div>
          <Switch
            checked={smsSettings.enabled}
            onCheckedChange={(checked) => setSmsSettings({ ...smsSettings, enabled: checked })}
          />
        </div>
        {smsSettings.enabled && (
          <>
            <div className="space-y-2">
              <Label>שעות לפני הפגישה</Label>
              <p className="text-xs text-muted-foreground">כמה שעות לפני הפגישה לשלוח את התזכורת</p>
              <Input
                type="number"
                min="1"
                max="72"
                value={smsSettings.hoursBeforeReminder}
                onChange={(e) => setSmsSettings({ ...smsSettings, hoursBeforeReminder: parseInt(e.target.value) || 24 })}
                className="w-24"
              />
            </div>
            <div className="space-y-2">
              <Label>טקסט ההודעה (אופציונלי)</Label>
              <p className="text-xs text-muted-foreground">התאם אישית את נוסח ההודעה. השאר ריק לטקסט ברירת המחדל.</p>
              <Textarea
                placeholder={defaultSmsMessage}
                value={smsSettings.customMessage || ""}
                onChange={(e) => setSmsSettings({ ...smsSettings, customMessage: e.target.value || null })}
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                משתנים זמינים: {"{שם}"} = שם המטופל, {"{תאריך}"} = תאריך הפגישה, {"{שעה}"} = שעת הפגישה
              </p>
            </div>
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
