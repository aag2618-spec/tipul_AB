"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Calendar, Mail, Link as LinkIcon, Unlink, CheckCircle, AlertCircle,
  CreditCard, FileText, Settings as SettingsIcon, Eye, EyeOff,
  Shield, Save, Loader2, Building2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

interface BillingProvider {
  id: string;
  provider: string;
  displayName: string;
  isActive: boolean;
  isPrimary: boolean;
  lastSyncAt: string | null;
}

interface InsurerConfig {
  enabled: boolean;
  apiKey: string;
  secondaryField: string;
}

interface InsurerSettings {
  enabled: boolean;
  clalit: InsurerConfig;
  maccabi: InsurerConfig;
  meuhedet: { enabled: boolean; username: string; password: string };
  leumit: InsurerConfig;
  autoSubmit: boolean;
}

const providerInfo: Record<string, { name: string; description: string; icon: typeof CreditCard; features: string[] }> = {
  MESHULAM: {
    name: "Meshulam",
    description: "סליקת אשראי + הנפקת קבלות",
    icon: CreditCard,
    features: ["סליקת אשראי", "קבלות אוטומטיות", "תשלום בקישור"],
  },
  ICOUNT: {
    name: "iCount",
    description: "הנפקת קבלות (תוכנית חינמית!)",
    icon: FileText,
    features: ["קבלות מקצועיות", "דוחות", "חינמי עד 25/חודש"],
  },
  GREEN_INVOICE: {
    name: "חשבונית ירוקה",
    description: "הנפקת קבלות (ממשק יפה)",
    icon: FileText,
    features: ["קבלות מעוצבות", "ממשק נוח"],
  },
  SUMIT: {
    name: "Sumit",
    description: "קבלות + סליקה",
    icon: CreditCard,
    features: ["סליקה", "קבלות", "Developer Friendly"],
  },
};

export function ConnectionsTab() {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const [billingProviders, setBillingProviders] = useState<BillingProvider[]>([]);
  const [showBillingDialog, setShowBillingDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);

  const [insurerSettings, setInsurerSettings] = useState<InsurerSettings>({
    enabled: false,
    clalit: { enabled: false, apiKey: "", secondaryField: "" },
    maccabi: { enabled: false, apiKey: "", secondaryField: "" },
    meuhedet: { enabled: false, username: "", password: "" },
    leumit: { enabled: false, apiKey: "", secondaryField: "" },
    autoSubmit: false,
  });
  const [savingInsurers, setSavingInsurers] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/user/google-calendar").then(r => r.ok ? r.json() : { connected: false }),
      fetch("/api/integrations/billing").then(r => r.ok ? r.json() : []),
      fetch("/api/health-insurers/settings").then(r => r.ok ? r.json() : null),
    ]).then(([googleData, billingData, insurerData]) => {
      setGoogleConnected(googleData.connected);
      setGoogleEmail(googleData.email || null);
      setBillingProviders(billingData);
      if (insurerData) {
        setInsurerSettings({
          enabled: insurerData.enabled,
          clalit: { enabled: insurerData.clalitEnabled, apiKey: insurerData.clalitApiKey || "", secondaryField: insurerData.clalitFacilityId || "" },
          maccabi: { enabled: insurerData.maccabiEnabled, apiKey: insurerData.maccabiApiKey || "", secondaryField: insurerData.maccabiProviderId || "" },
          meuhedet: { enabled: insurerData.meuhedetEnabled, username: insurerData.meuhedetUsername || "", password: insurerData.meuhedetPassword || "" },
          leumit: { enabled: insurerData.leumitEnabled, apiKey: insurerData.leumitApiKey || "", secondaryField: insurerData.leumitClinicCode || "" },
          autoSubmit: insurerData.autoSubmit,
        });
      }
    }).catch(err => console.error("Failed to load:", err))
      .finally(() => setLoading(false));
  }, []);

  const connectGoogle = async () => {
    await signIn("google", { callbackUrl: "/dashboard/settings?tab=connections" });
  };

  const disconnectGoogle = async () => {
    if (!confirm("האם אתה בטוח שברצונך לנתק את Google?")) return;
    setDisconnecting(true);
    try {
      const res = await fetch("/api/user/google-calendar", { method: "DELETE" });
      if (res.ok) { setGoogleConnected(false); setGoogleEmail(null); toast.success("נותק"); }
      else toast.error("שגיאה");
    } catch { toast.error("שגיאה"); }
    finally { setDisconnecting(false); }
  };

  const testBillingConnection = async (providerId: string) => {
    setTestingConnection(providerId);
    try {
      const res = await fetch("/api/integrations/billing/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId }) });
      const data = await res.json();
      data.success ? toast.success(data.message || "החיבור תקין!") : toast.error(data.message || "נכשל");
    } catch { toast.error("שגיאה"); }
    finally { setTestingConnection(null); }
  };

  const openBillingDialog = (provider: string) => {
    setSelectedProvider(provider); setApiKey(""); setApiSecret("");
    setShowApiKey(false); setShowApiSecret(false); setShowBillingDialog(true);
  };

  const saveBillingProvider = async () => {
    if (!selectedProvider || !apiKey) { toast.error("יש למלא API Key"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/billing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: selectedProvider, apiKey, apiSecret: apiSecret || null }) });
      if (res.ok) { toast.success("נוסף!"); setShowBillingDialog(false); const data = await fetch("/api/integrations/billing").then(r => r.json()); setBillingProviders(data); }
      else { const err = await res.json(); toast.error(err.error || "שגיאה"); }
    } catch { toast.error("שגיאה"); }
    finally { setSaving(false); }
  };

  const disconnectBillingProvider = async (id: string) => {
    if (!confirm("האם אתה בטוח?")) return;
    try {
      const res = await fetch(`/api/integrations/billing/${id}`, { method: "DELETE" });
      if (res.ok) { toast.success("נותק"); const data = await fetch("/api/integrations/billing").then(r => r.json()); setBillingProviders(data); }
      else toast.error("שגיאה");
    } catch { toast.error("שגיאה"); }
  };

  const saveInsurerSettings = async () => {
    setSavingInsurers(true);
    try {
      const res = await fetch("/api/health-insurers/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: insurerSettings.enabled, autoSubmit: insurerSettings.autoSubmit,
          clalitEnabled: insurerSettings.clalit.enabled, clalitApiKey: insurerSettings.clalit.apiKey, clalitFacilityId: insurerSettings.clalit.secondaryField,
          maccabiEnabled: insurerSettings.maccabi.enabled, maccabiApiKey: insurerSettings.maccabi.apiKey, maccabiProviderId: insurerSettings.maccabi.secondaryField,
          meuhedetEnabled: insurerSettings.meuhedet.enabled, meuhedetUsername: insurerSettings.meuhedet.username, meuhedetPassword: insurerSettings.meuhedet.password,
          leumitEnabled: insurerSettings.leumit.enabled, leumitApiKey: insurerSettings.leumit.apiKey, leumitClinicCode: insurerSettings.leumit.secondaryField,
        }),
      });
      res.ok ? toast.success("נשמר!") : toast.error("שגיאה");
    } catch { toast.error("שגיאה"); }
    finally { setSavingInsurers(false); }
  };

  const connectedProvider = (type: string) => billingProviders.find(p => p.provider === type && p.isActive);

  if (loading) {
    return <div className="h-[30vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const insurerItems = [
    { key: "clalit", label: "כללית", color: "text-green-600", config: insurerSettings.clalit, keyLabel: "API Key", secLabel: "קוד מוסד" },
    { key: "maccabi", label: "מכבי", color: "text-blue-600", config: insurerSettings.maccabi, keyLabel: "API Key", secLabel: "קוד ספק" },
    { key: "leumit", label: "לאומית", color: "text-red-600", config: insurerSettings.leumit, keyLabel: "API Key", secLabel: "קוד מרפאה" },
  ];

  return (
    <div className="space-y-6">
      {/* Google Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Google Calendar
                  {googleConnected ? (
                    <Badge className="bg-emerald-50 text-emerald-900 border border-emerald-200"><CheckCircle className="h-3 w-3 ml-1" />מחובר</Badge>
                  ) : (
                    <Badge variant="secondary"><AlertCircle className="h-3 w-3 ml-1" />לא מחובר</Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs">סנכרון פגישות עם יומן Google</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {googleConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                מחובר כ: <strong>{googleEmail}</strong>
              </div>
              <Button variant="outline" size="sm" className="gap-1 text-destructive" onClick={disconnectGoogle} disabled={disconnecting}>
                <Unlink className="h-3 w-3" />{disconnecting ? "מנתק..." : "נתק"}
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={connectGoogle} className="gap-1">
              <LinkIcon className="h-3 w-3" />התחבר עם Google
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Billing Providers */}
      <div>
        <h3 className="font-semibold mb-3">ספקי חיוב וקבלות</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(providerInfo).map(([key, info]) => {
            const connected = connectedProvider(key);
            const Icon = info.icon;
            return (
              <Card key={key} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{info.name}</span>
                  {connected ? (
                    <Badge className="bg-emerald-50 text-emerald-900 border border-emerald-200 text-[10px] py-0"><CheckCircle className="h-2.5 w-2.5 ml-0.5" />מחובר</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] py-0">לא מחובר</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">{info.description}</p>
                {connected ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => testBillingConnection(connected.id)} disabled={testingConnection === connected.id}>
                      {testingConnection === connected.id ? "בודק..." : "בדוק"}
                    </Button>
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => openBillingDialog(key)}>הגדרות</Button>
                    <Button variant="outline" size="sm" className="text-xs h-7 text-destructive" onClick={() => disconnectBillingProvider(connected.id)}>נתק</Button>
                  </div>
                ) : (
                  <Button size="sm" className="text-xs h-7" onClick={() => openBillingDialog(key)}>
                    <LinkIcon className="h-3 w-3 ml-1" />התחבר
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Health Insurers */}
      <Accordion type="single" collapsible>
        <AccordionItem value="insurers" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <span className="font-semibold">קופות חולים</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${insurerSettings.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {insurerSettings.enabled ? "פעיל" : "כבוי"}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="flex items-center justify-between">
              <Label>הפעל שילוב קופות חולים</Label>
              <Switch checked={insurerSettings.enabled} onCheckedChange={(checked) => setInsurerSettings(p => ({ ...p, enabled: checked }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>שליחה אוטומטית בסיום פגישה</Label>
              <Switch checked={insurerSettings.autoSubmit} onCheckedChange={(checked) => setInsurerSettings(p => ({ ...p, autoSubmit: checked }))} disabled={!insurerSettings.enabled} />
            </div>

            {insurerItems.map(item => (
              <Card key={item.key} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Shield className={`h-4 w-4 ${item.color}`} />
                    <span className="font-medium text-sm">{item.label}</span>
                  </div>
                  <Switch
                    checked={item.config.enabled}
                    onCheckedChange={(checked) => setInsurerSettings(p => ({ ...p, [item.key]: { ...p[item.key as keyof InsurerSettings] as InsurerConfig, enabled: checked } }))}
                    disabled={!insurerSettings.enabled}
                  />
                </div>
                {item.config.enabled && (
                  <div className="space-y-2">
                    <Input type="password" placeholder={item.keyLabel} value={item.config.apiKey}
                      onChange={(e) => setInsurerSettings(p => ({ ...p, [item.key]: { ...p[item.key as keyof InsurerSettings] as InsurerConfig, apiKey: e.target.value } }))} />
                    <Input placeholder={item.secLabel} value={item.config.secondaryField}
                      onChange={(e) => setInsurerSettings(p => ({ ...p, [item.key]: { ...p[item.key as keyof InsurerSettings] as InsurerConfig, secondaryField: e.target.value } }))} />
                  </div>
                )}
              </Card>
            ))}

            {/* Meuhedet - special fields */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-orange-600" />
                  <span className="font-medium text-sm">מאוחדת</span>
                </div>
                <Switch
                  checked={insurerSettings.meuhedet.enabled}
                  onCheckedChange={(checked) => setInsurerSettings(p => ({ ...p, meuhedet: { ...p.meuhedet, enabled: checked } }))}
                  disabled={!insurerSettings.enabled}
                />
              </div>
              {insurerSettings.meuhedet.enabled && (
                <div className="space-y-2">
                  <Input placeholder="שם משתמש" value={insurerSettings.meuhedet.username}
                    onChange={(e) => setInsurerSettings(p => ({ ...p, meuhedet: { ...p.meuhedet, username: e.target.value } }))} />
                  <Input type="password" placeholder="סיסמה" value={insurerSettings.meuhedet.password}
                    onChange={(e) => setInsurerSettings(p => ({ ...p, meuhedet: { ...p.meuhedet, password: e.target.value } }))} />
                </div>
              )}
            </Card>

            <div className="flex justify-end">
              <Button onClick={saveInsurerSettings} disabled={savingInsurers} size="sm" className="gap-1">
                {savingInsurers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                שמור קופות חולים
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Billing Dialog */}
      <Dialog open={showBillingDialog} onOpenChange={setShowBillingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>חיבור {selectedProvider && providerInfo[selectedProvider]?.name}</DialogTitle>
            <DialogDescription>הזן את פרטי ה-API שלך. המידע נשמר מוצפן.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>API Key *</Label>
              <div className="relative">
                <Input type={showApiKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" className="pl-10" />
                <Button type="button" variant="ghost" size="sm" className="absolute left-0 top-0 h-full px-3" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {(selectedProvider === "MESHULAM" || selectedProvider === "SUMIT") && (
              <div className="space-y-2">
                <Label>API Secret</Label>
                <div className="relative">
                  <Input type={showApiSecret ? "text" : "password"} value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="API Secret (אופציונלי)" className="pl-10" />
                  <Button type="button" variant="ghost" size="sm" className="absolute left-0 top-0 h-full px-3" onClick={() => setShowApiSecret(!showApiSecret)}>
                    {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBillingDialog(false)}>ביטול</Button>
            <Button onClick={saveBillingProvider} disabled={!apiKey || saving}>{saving ? "שומר..." : "שמור וחבר"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
