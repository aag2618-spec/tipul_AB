"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Shield, Save, Loader2, Building2 } from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

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

interface HealthInsurersSectionProps {
  insurerSettings: InsurerSettings;
  setInsurerSettings: React.Dispatch<React.SetStateAction<InsurerSettings>>;
  savingInsurers: boolean;
  saveInsurerSettings: () => Promise<void>;
}

export function HealthInsurersSection({
  insurerSettings,
  setInsurerSettings,
  savingInsurers,
  saveInsurerSettings,
}: HealthInsurersSectionProps) {
  const insurerItems = [
    { key: "clalit", label: "כללית", color: "text-green-600", config: insurerSettings.clalit, keyLabel: "API Key", secLabel: "קוד מוסד" },
    { key: "maccabi", label: "מכבי", color: "text-sky-600", config: insurerSettings.maccabi, keyLabel: "API Key", secLabel: "קוד ספק" },
    { key: "leumit", label: "לאומית", color: "text-red-600", config: insurerSettings.leumit, keyLabel: "API Key", secLabel: "קוד מרפאה" },
  ];

  return (
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
            <div className="space-y-0.5">
              <Label>הפעל שילוב קופות חולים</Label>
              <p className="text-xs text-muted-foreground">אפשר דיווח ישיר לקופות חולים על פגישות שבוצעו</p>
            </div>
            <Switch checked={insurerSettings.enabled} onCheckedChange={(checked) => setInsurerSettings(p => ({ ...p, enabled: checked }))} />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>שליחה אוטומטית בסיום פגישה</Label>
              <p className="text-xs text-muted-foreground">דווח אוטומטית לקופה כשסיימת פגישה. אם כבוי - תצטרך לדווח ידנית.</p>
            </div>
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
  );
}
