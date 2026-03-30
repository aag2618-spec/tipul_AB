"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  Accordion,
} from "@/components/ui/accordion";
import { NotificationChannelsSection } from "@/components/settings/notification-channels-section";
import { SmsSection } from "@/components/settings/sms-section";
import { EmailAutomationSection } from "@/components/settings/email-automation-section";

interface NotificationSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
  debtThresholdDays: number;
  monthlyReminderDay: number | null;
  morningTime: string;
  eveningTime: string;
}

interface SMSSettings {
  enabled: boolean;
  hoursBeforeReminder: number;
  customMessage: string | null;
  sendOnWeekends: boolean;
}

interface CommunicationSettings {
  sendConfirmationEmail: boolean;
  send24hReminder: boolean;
  send2hReminder: boolean;
  customReminderEnabled: boolean;
  customReminderHours: number;
  allowClientCancellation: boolean;
  minCancellationHours: number;
  sendDebtReminders: boolean;
  debtReminderDayOfMonth: number;
  debtReminderMinAmount: number;
  sendPaymentReceipt: boolean;
  sendReceiptToClient: boolean;
  sendReceiptToTherapist: boolean;
  receiptEmailTemplate: string | null;
  paymentInstructions: string | null;
  paymentLink: string | null;
  emailSignature: string | null;
  logoUrl: string | null;
  customGreeting: string | null;
  customClosing: string | null;
  businessHours: string | null;
}

export function NotificationsTab() {
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    emailEnabled: true,
    pushEnabled: true,
    debtThresholdDays: 30,
    monthlyReminderDay: null,
    morningTime: "08:00",
    eveningTime: "20:00",
  });
  const [smsSettings, setSmsSettings] = useState<SMSSettings>({
    enabled: false,
    hoursBeforeReminder: 24,
    customMessage: null,
    sendOnWeekends: false,
  });
  const [commSettings, setCommSettings] = useState<CommunicationSettings>({
    sendConfirmationEmail: true,
    send24hReminder: true,
    send2hReminder: false,
    customReminderEnabled: false,
    customReminderHours: 2,
    allowClientCancellation: true,
    minCancellationHours: 24,
    sendDebtReminders: false,
    debtReminderDayOfMonth: 1,
    debtReminderMinAmount: 50,
    sendPaymentReceipt: false,
    sendReceiptToClient: true,
    sendReceiptToTherapist: false,
    receiptEmailTemplate: null,
    paymentInstructions: null,
    paymentLink: null,
    emailSignature: null,
    logoUrl: null,
    customGreeting: null,
    customClosing: null,
    businessHours: null,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadSettings = () => {
    Promise.all([
      fetch("/api/user/notification-settings", { cache: "no-store" }).then(r => r.ok ? r.json() : []),
      fetch("/api/sms/settings", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
      fetch("/api/user/communication-settings", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
    ]).then(([notifData, smsData, commData]) => {
      if (notifData && notifData.length > 0) {
        const emailSetting = notifData.find((s: { channel: string }) => s.channel === "email");
        const pushSetting = notifData.find((s: { channel: string }) => s.channel === "push");
        setNotifSettings({
          emailEnabled: emailSetting?.enabled ?? true,
          pushEnabled: pushSetting?.enabled ?? true,
          debtThresholdDays: emailSetting?.debtThresholdDays || 30,
          monthlyReminderDay: emailSetting?.monthlyReminderDay || null,
          morningTime: emailSetting?.morningTime || "08:00",
          eveningTime: emailSetting?.eveningTime || "20:00",
        });
      }
      if (smsData) setSmsSettings({ ...smsData, sendOnWeekends: false });
      if (commData?.settings) setCommSettings(commData.settings);
    }).catch(err => console.error("Failed to load settings:", err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const results = await Promise.all([
        fetch("/api/user/notification-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notifSettings),
        }),
        fetch("/api/sms/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...smsSettings, sendOnWeekends: false }),
        }),
        fetch("/api/user/communication-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(commSettings),
        }),
      ]);

      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        toast.error(`שגיאה בשמירת ${failed.length} הגדרות. נסה שוב.`);
      } else {
        toast.success("כל ההגדרות נשמרו בהצלחה");
        loadSettings();
      }
    } catch {
      toast.error("שגיאה בשמירת ההגדרות");
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
    <div className="space-y-6">
      <Accordion type="multiple" defaultValue={["notifications", "sms", "automation"]} className="space-y-4">
        <NotificationChannelsSection
          notifSettings={notifSettings}
          setNotifSettings={setNotifSettings}
        />

        <SmsSection
          smsSettings={smsSettings}
          setSmsSettings={setSmsSettings}
        />

        <EmailAutomationSection
          commSettings={commSettings}
          setCommSettings={setCommSettings}
        />
      </Accordion>

      <div className="flex justify-end">
        <Button onClick={handleSaveAll} disabled={isSaving} size="lg" className="gap-2">
          {isSaving ? (
            <><Loader2 className="h-5 w-5 animate-spin" />שומר...</>
          ) : (
            <><Save className="h-5 w-5" />שמור הכל</>
          )}
        </Button>
      </div>
    </div>
  );
}
