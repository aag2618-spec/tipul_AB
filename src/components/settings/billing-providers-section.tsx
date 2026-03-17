"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Link as LinkIcon, CreditCard, FileText } from "lucide-react";

interface BillingProvider {
  id: string;
  provider: string;
  displayName: string;
  isActive: boolean;
  isPrimary: boolean;
  lastSyncAt: string | null;
}

interface ProviderInfo {
  name: string;
  description: string;
  icon: typeof CreditCard;
  features: string[];
  fields: {
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    apiSecretLabel?: string;
    apiSecretPlaceholder?: string;
    apiSecretRequired?: boolean;
    extraFieldLabel?: string;
    extraFieldPlaceholder?: string;
    extraFieldIsPassword?: boolean;
  };
  instructions: string[];
  signupUrl: string;
}

interface BillingProvidersSectionProps {
  providerInfo: Record<string, ProviderInfo>;
  billingProviders: BillingProvider[];
  testingConnection: string | null;
  testBillingConnection: (providerId: string) => Promise<void>;
  openBillingDialog: (provider: string) => void;
  disconnectBillingProvider: (id: string) => Promise<void>;
}

export function BillingProvidersSection({
  providerInfo,
  billingProviders,
  testingConnection,
  testBillingConnection,
  openBillingDialog,
  disconnectBillingProvider,
}: BillingProvidersSectionProps) {
  const connectedProvider = (type: string) => billingProviders.find(p => p.provider === type && p.isActive);

  return (
    <div>
      <h3 className="font-semibold mb-1">ספקי חיוב וקבלות</h3>
      <p className="text-xs text-muted-foreground mb-3">חבר ספק חיצוני להנפקת קבלות מס וחשבוניות. נדרש רק לעוסקים מורשים (הגדר סוג עסק בטאב &quot;עסק וקבלות&quot;).</p>
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
  );
}
