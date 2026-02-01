'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { 
  Calendar, 
  Mail, 
  Link as LinkIcon, 
  Unlink, 
  CheckCircle, 
  AlertCircle, 
  CreditCard,
  FileText,
  Settings as SettingsIcon,
  Eye,
  EyeOff
} from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BillingProvider {
  id: string;
  provider: string;
  displayName: string;
  isActive: boolean;
  isPrimary: boolean;
  lastSyncAt: string | null;
}

export default function IntegrationsPage() {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  // Billing providers state
  const [billingProviders, setBillingProviders] = useState<BillingProvider[]>([]);
  const [showBillingDialog, setShowBillingDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkGoogleConnection();
    fetchBillingProviders();
  }, []);

  const checkGoogleConnection = async () => {
    try {
      const res = await fetch('/api/user/google-calendar');
      if (res.ok) {
        const data = await res.json();
        setGoogleConnected(data.connected);
        setGoogleEmail(data.email);
      }
    } catch (error) {
      console.error('Error checking Google connection:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBillingProviders = async () => {
    try {
      const res = await fetch('/api/integrations/billing');
      if (res.ok) {
        const data = await res.json();
        setBillingProviders(data);
      }
    } catch (error) {
      console.error('Error fetching billing providers:', error);
    }
  };

  const connectGoogle = async () => {
    // Use NextAuth to sign in with Google (will request calendar permissions)
    await signIn('google', { callbackUrl: '/dashboard/settings/integrations' });
  };

  const disconnectGoogle = async () => {
    if (!confirm('האם אתה בטוח שברצונך לנתק את החיבור ל-Google?')) return;
    
    setDisconnecting(true);
    try {
      const res = await fetch('/api/user/google-calendar', { method: 'DELETE' });
      if (res.ok) {
        setGoogleConnected(false);
        setGoogleEmail(null);
        toast.success('החיבור ל-Google נותק בהצלחה');
      } else {
        toast.error('שגיאה בניתוק החיבור');
      }
    } catch (error) {
      console.error('Error disconnecting Google:', error);
      toast.error('שגיאה בניתוק החיבור');
    } finally {
      setDisconnecting(false);
    }
  };

  const openBillingDialog = (provider: string) => {
    setSelectedProvider(provider);
    setApiKey('');
    setApiSecret('');
    setShowApiKey(false);
    setShowApiSecret(false);
    setShowBillingDialog(true);
  };

  const saveBillingProvider = async () => {
    if (!selectedProvider || !apiKey) {
      toast.error('יש למלא את כל השדות');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/integrations/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey,
          apiSecret: apiSecret || null,
        }),
      });

      if (res.ok) {
        toast.success('הספק נוסף בהצלחה!');
        setShowBillingDialog(false);
        fetchBillingProviders();
      } else {
        const error = await res.json();
        toast.error(error.error || 'שגיאה בשמירה');
      }
    } catch (error) {
      console.error('Error saving billing provider:', error);
      toast.error('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const disconnectBillingProvider = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך לנתק את הספק?')) return;

    try {
      const res = await fetch(`/api/integrations/billing/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('הספק נותק בהצלחה');
        fetchBillingProviders();
      } else {
        toast.error('שגיאה בניתוק');
      }
    } catch (error) {
      console.error('Error disconnecting billing provider:', error);
      toast.error('שגיאה בניתוק');
    }
  };

  const providerInfo: Record<string, { name: string; description: string; logo?: string; icon: any; features: string[] }> = {
    MESHULAM: {
      name: 'Meshulam',
      description: 'סליקת אשראי + הנפקת קבלות',
      logo: 'https://www.meshulam.co.il/wp-content/uploads/2021/03/logo.svg',
      icon: CreditCard,
      features: ['💳 סליקת אשראי', '🧾 קבלות אוטומטיות', '🔗 תשלום בקישור'],
    },
    ICOUNT: {
      name: 'iCount',
      description: 'הנפקת קבלות (יש תוכנית חינמית!)',
      logo: 'https://www.icount.co.il/images/logo.svg',
      icon: FileText,
      features: ['🧾 קבלות מקצועיות', '📊 דוחות', '✅ חינמי עד 25/חודש'],
    },
    GREEN_INVOICE: {
      name: 'חשבונית ירוקה',
      description: 'הנפקת קבלות (ממשק יפה)',
      logo: 'https://www.greeninvoice.co.il/wp-content/themes/greeninvoice/images/logo.svg',
      icon: FileText,
      features: ['🧾 קבלות מעוצבות', '📱 ממשק נוח', '🎨 הכי יפה'],
    },
    SUMIT: {
      name: 'Sumit',
      description: 'קבלות + סליקה במקום אחד',
      logo: 'https://sumit.co.il/wp-content/uploads/2022/08/logo.svg',
      icon: CreditCard,
      features: ['💳 סליקה', '🧾 קבלות', '🔧 Developer Friendly'],
    },
  };

  const connectedProvider = (providerType: string) => {
    return billingProviders.find(p => p.provider === providerType && p.isActive);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">אינטגרציות</h1>
        <p className="text-muted-foreground">
          חיבור שירותים חיצוניים למערכת
        </p>
      </div>

      {/* Navigation */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings">
            פרופיל
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/notifications">
            התראות
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/communication">
            תקשורת
          </Link>
        </Button>
        <Button variant="default" size="sm" className="gap-2">
          <LinkIcon className="h-4 w-4" />
          אינטגרציות
        </Button>
      </div>

      <div className="grid gap-6">
        {/* Google Calendar Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Calendar className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Google Calendar
                    {googleConnected ? (
                      <Badge variant="default" className="bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200">
                        <CheckCircle className="h-3 w-3 ml-1" />
                        מחובר
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <AlertCircle className="h-3 w-3 ml-1" />
                        לא מחובר
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    סנכרון פגישות עם יומן Google שלך
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {googleConnected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">מחובר כ: <strong>{googleEmail}</strong></span>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>✅ פגישות חדשות יתווספו אוטומטית ליומן Google שלך</p>
                  <p>✅ שינויים וביטולים יתעדכנו אוטומטית</p>
                  <p>✅ המטופלים יקבלו הזמנה ליומן שלהם</p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={disconnectGoogle}
                  disabled={disconnecting}
                >
                  <Unlink className="h-4 w-4" />
                  {disconnecting ? 'מנתק...' : 'נתק חיבור'}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p>חיבור ל-Google Calendar יאפשר לך:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>סנכרון אוטומטי של כל הפגישות שלך</li>
                    <li>שליחת הזמנות יומן למטופלים</li>
                    <li>עדכון אוטומטי בעת שינוי או ביטול</li>
                    <li>תזכורות דרך יומן Google</li>
                  </ul>
                </div>
                <Button onClick={connectGoogle} className="gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  התחבר עם Google
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Billing & Receipt Providers */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">חיוב וקבלות</h2>
              <p className="text-sm text-muted-foreground">
                חבר את המערכת שלך להנפקת קבלות וסליקת אשראי
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(providerInfo).map(([key, info]) => {
              const connected = connectedProvider(key);
              const Icon = info.icon;
              
              return (
                <Card key={key} className="relative">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center p-2">
                          {info.logo ? (
                            <img 
                              src={info.logo} 
                              alt={info.name}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                // Fallback to icon if logo fails to load
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const icon = target.nextSibling as HTMLElement;
                                if (icon) icon.style.display = 'block';
                              }}
                            />
                          ) : null}
                          <Icon className={`h-5 w-5 text-primary ${info.logo ? 'hidden' : ''}`} />
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {info.name}
                            {connected ? (
                              <Badge className="bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200">
                                <CheckCircle className="h-3 w-3 ml-1" />
                                מחובר
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                לא מחובר
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {info.description}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <ul className="text-sm space-y-1">
                        {info.features.map((feature, idx) => (
                          <li key={idx} className="text-muted-foreground">{feature}</li>
                        ))}
                      </ul>
                      
                      {connected ? (
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openBillingDialog(key)}
                          >
                            <SettingsIcon className="h-3 w-3 ml-1" />
                            הגדרות
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => disconnectBillingProvider(connected.id)}
                          >
                            <Unlink className="h-3 w-3 ml-1" />
                            נתק
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="w-full"
                          size="sm"
                          onClick={() => openBillingDialog(key)}
                        >
                          <LinkIcon className="h-3 w-3 ml-1" />
                          התחבר
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm space-y-1">
                  <p className="font-semibold text-blue-900 dark:text-blue-300">
                    💡 חשוב לדעת:
                  </p>
                  <ul className="text-blue-800 dark:text-blue-400 space-y-1 mr-4">
                    <li>• כל ספק דורש פתיחת חשבון אצלו (רוב מציעים ניסיון חינם)</li>
                    <li>• ה-API Key נשמר מוצפן ומאובטח במערכת</li>
                    <li>• התשלומים והקבלות מנוהלים ישירות מהחשבון שלך</li>
                    <li>• אתה יכול להחליף ספק בכל עת</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Email Integration Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
                <Mail className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  שליחת מיילים
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 ml-1" />
                    מוגדר
                  </Badge>
                </CardTitle>
                <CardDescription>
                  מיילים אוטומטיים למטופלים
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              <p>המערכת שולחת מיילים אוטומטיים עבור:</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>אישור קביעת תור</li>
                <li>תזכורות לפני פגישות (24 שעות / 2 שעות)</li>
                <li>בקשות ביטול ועדכונים</li>
              </ul>
              <p className="mt-3">
                <Link href="/dashboard/settings/communication" className="text-primary hover:underline">
                  ניהול הגדרות מיילים →
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Billing Provider Dialog */}
      <Dialog open={showBillingDialog} onOpenChange={setShowBillingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              חיבור {selectedProvider && providerInfo[selectedProvider]?.name}
            </DialogTitle>
            <DialogDescription>
              הזן את פרטי ה-API שלך. המידע נשמר מוצפן ומאובטח.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="הדבק את ה-API Key שלך"
                  className="pl-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute left-0 top-0 h-full px-3"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {(selectedProvider === 'MESHULAM' || selectedProvider === 'SUMIT') && (
              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <div className="relative">
                  <Input
                    id="apiSecret"
                    type={showApiSecret ? 'text' : 'password'}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    placeholder="הדבק את ה-API Secret (אופציונלי)"
                    className="pl-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute left-0 top-0 h-full px-3"
                    onClick={() => setShowApiSecret(!showApiSecret)}
                  >
                    {showApiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm dark:bg-blue-950/20 dark:border-blue-800">
              <p className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                📖 איך למצוא את ה-API Key?
              </p>
              {selectedProvider === 'MESHULAM' && (
                <ol className="text-blue-800 dark:text-blue-400 space-y-1 mr-4 list-decimal">
                  <li>היכנס ל-<a href="https://secure.meshulam.co.il" target="_blank" className="underline">Meshulam</a></li>
                  <li>לחץ על "הגדרות" → "API"</li>
                  <li>העתק את ה-"Page Code" או "API Key"</li>
                  <li>הדבק כאן</li>
                </ol>
              )}
              {selectedProvider === 'ICOUNT' && (
                <ol className="text-blue-800 dark:text-blue-400 space-y-1 mr-4 list-decimal">
                  <li>היכנס ל-<a href="https://www.icount.co.il" target="_blank" className="underline">iCount</a></li>
                  <li>לחץ על "הגדרות" → "API"</li>
                  <li>צור API Token חדש</li>
                  <li>העתק והדבק כאן</li>
                </ol>
              )}
              {selectedProvider === 'GREEN_INVOICE' && (
                <ol className="text-blue-800 dark:text-blue-400 space-y-1 mr-4 list-decimal">
                  <li>היכנס ל-<a href="https://www.greeninvoice.co.il" target="_blank" className="underline">חשבונית ירוקה</a></li>
                  <li>הגדרות → אינטגרציות → API</li>
                  <li>צור מפתח חדש</li>
                  <li>העתק והדבק כאן</li>
                </ol>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBillingDialog(false)}>
              ביטול
            </Button>
            <Button onClick={saveBillingProvider} disabled={!apiKey || saving}>
              {saving ? 'שומר...' : 'שמור וחבר'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
