"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  return (
    <AccordionItem value="sms" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="font-semibold">תזכורות SMS</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            בקרוב
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pb-4">
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">שליחת תזכורות SMS למטופלים לפני הפגישה</p>
          <p className="text-xs text-muted-foreground mt-2">פיצ&apos;ר זה בפיתוח ויהיה זמין בקרוב. ההגדרות שלך יישמרו.</p>
        </div>
        <div className="opacity-50 pointer-events-none space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>הפעל תזכורות SMS</Label>
              <p className="text-xs text-muted-foreground">שלח הודעת SMS אוטומטית למטופלים לפני הפגישה</p>
            </div>
            <Switch checked={false} disabled />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
