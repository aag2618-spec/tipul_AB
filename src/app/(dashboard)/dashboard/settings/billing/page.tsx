'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  CreditCard,
  CheckCircle,
  AlertCircle,
  Download,
  Loader2,
  RefreshCw,
  XCircle,
  ArrowUpCircle,
  Info,
  Shield,
  Megaphone,
  Building2,
  Calendar,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SmsPackagesCard } from '@/components/billing/sms-packages-card';
import { ClinicUpgradeCard } from '@/components/billing/clinic-upgrade-card';

// ========================================
// תוכנית אחת — MyTipul
// פיצ'ר ה-AI הוסר; אין עוד מסלולי Essential/Pro/Enterprise בתצוגה.
// המחיר עצמו מגיע דינמית מ-/api/subscription/status (נשלט מהניהול:
// admin/tier-settings + PricingPolicy). השם המוצג אחיד לכולם — MyTipul.
// ========================================

const PLAN_DISPLAY_NAME = 'MyTipul';

// היכולות האמיתיות של התוכנית (ללא AI) — מוצגות תחת "מה כלול בתוכנית".
const MYTIPUL_FEATURES = [
  'ניהול מטופלים ותיק מלא',
  'יומן ופגישות',
  'רשימת המתנה',
  'תשלומים, קבלות וחשבוניות',
  'התחייבויות לקופות חולים',
  'תזכורות אוטומטיות (SMS ומייל)',
  'זימון עצמי למטופלים',
  'הכנה לפגישה וסיכומים',
  'שאלונים וטפסי הסכמה דיגיטליים',
  'מסמכים ודפי עבודה טיפוליים',
  'דוחות והכנסות אישיים',
  'שמירת מידע רפואי מאובטחת',
];

// ========================================
// חישוב מחיר הוגן לביטול מוקדם (נשמר עבור מנויים רב-חודשיים קיימים).
// ========================================
type PlanData = {
  pricing: { 1: number; 3: number; 6: number; 12: number };
  originalPricing: { 1: number; 3: number; 6: number; 12: number } | null;
};

function calculateFairPrice(
  plans: Record<string, PlanData>,
  planKey: string,
  monthsUsed: number
): number {
  const plan = plans[planKey];
  if (!plan) return 0;

  if (monthsUsed >= 12) return plan.pricing[12];
  if (monthsUsed >= 6) return plan.pricing[6] + (monthsUsed - 6) * plan.pricing[1];
  if (monthsUsed >= 3) return plan.pricing[3] + (monthsUsed - 3) * plan.pricing[1];
  return monthsUsed * plan.pricing[1];
}

function calculateCancellationAdjustment(
  plans: Record<string, PlanData>,
  planKey: string,
  totalMonths: number,
  monthsUsed: number,
  totalPaid: number
): { adjustment: number; fairPrice: number; paidSoFar: number } {
  const fairPrice = calculateFairPrice(plans, planKey, monthsUsed);
  const paidSoFar = Math.round((totalPaid / totalMonths) * monthsUsed);
  const adjustment = Math.max(0, fairPrice - paidSoFar);

  return { adjustment, fairPrice, paidSoFar };
}

// ========================================

interface TierPricing {
  tier: 'ESSENTIAL' | 'PRO' | 'ENTERPRISE';
  pricing: { 1: number; 3: number; 6: number; 12: number };
  originalPricing: { 1: number; 3: number; 6: number; 12: number } | null;
}

interface SubscriptionStatus {
  plan: 'ESSENTIAL' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED';
  isActive: boolean;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  monthlyPrice: number;
  pendingTier: 'ESSENTIAL' | 'PRO' | 'ENTERPRISE' | null;
  pendingTierEffectiveAt: string | null;
  billingPaidByClinic?: boolean;
  subscriptionPausedReason?: string | null;
  clinicName?: string | null;
  recentPayments: Array<{
    id: string;
    amount: number;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
    paidAt: string | null;
    invoiceUrl: string | null;
  }>;
}

export default function BillingPage() {
  const { data: session } = useSession();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [tiers, setTiers] = useState<TierPricing[] | null>(null);
  const [subscriptionError, setSubscriptionError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [activePromotion, setActivePromotion] = useState<{
    title: string;
    description: string | null;
    discountPercent: number;
    validUntil: string | null;
  } | null>(null);

  useEffect(() => {
    void Promise.all([fetchSubscription(), fetchTiers(), fetchPromotion()]).finally(() => setLoading(false));
  }, []);

  const fetchSubscription = async () => {
    setSubscriptionError(false);
    try {
      const res = await fetch('/api/subscription/status');
      if (!res.ok) {
        setSubscriptionError(true);
        toast.error('שגיאה בטעינת פרטי מנוי');
        return;
      }
      const data = await res.json();
      setSubscription(data);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      setSubscriptionError(true);
      toast.error('שגיאה בטעינת פרטי מנוי');
    }
  };

  // נטען עבור חישוב התאמת הביטול של מנויים רב-חודשיים קיימים. בלי תצוגת מסלולים.
  const fetchTiers = async () => {
    try {
      const res = await fetch('/api/subscription/tiers');
      if (!res.ok) return;
      const data = await res.json();
      setTiers(data.tiers);
    } catch (error) {
      console.error('Error fetching tiers:', error);
    }
  };

  const fetchPromotion = async () => {
    try {
      const res = await fetch('/api/subscription/promotions');
      if (res.ok) {
        const data = await res.json();
        if (data.promotions?.length > 0) {
          setActivePromotion(data.promotions[0]);
        }
      }
    } catch {
      // מבצעים לא קריטיים — אם נכשל, פשוט לא מציגים
    }
  };

  // מחירים מותאמים אישית לפי מסלול (מ-DB) — לחישוב התאמת הביטול בלבד.
  const PLANS = useMemo<Record<string, PlanData>>(() => {
    if (!tiers) return {};
    const map: Record<string, PlanData> = {};
    for (const t of tiers) {
      map[t.tier] = { pricing: t.pricing, originalPricing: t.originalPricing ?? null };
    }
    return map;
  }, [tiers]);

  const handleSubscribe = async () => {
    if (subscribing || !subscription) return;
    setSubscribing(true);
    try {
      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: subscription.plan, billingMonths: 1, termsAccepted: true }),
      });

      if (res.ok) {
        const data = await res.json();
        window.location.href = data.paymentUrl;
      } else {
        const error = await res.json();
        toast.error(error.message || error.error || 'שגיאה ביצירת מנוי');
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      toast.error('שגיאה ביצירת מנוי');
    } finally {
      setSubscribing(false);
    }
  };

  const handleCancelSubscription = async () => {
    setCancelling(true);
    try {
      const res = await fetch('/api/subscription/cancel', { method: 'POST' });
      if (res.ok) {
        toast.success('המנוי בוטל בהצלחה. תוכל להמשיך להשתמש עד סוף התקופה הנוכחית.');
        setShowCancelDialog(false);
        fetchSubscription();
      } else {
        const error = await res.json();
        toast.error(error.message || error.error || 'שגיאה בביטול המנוי');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast.error('שגיאה בביטול המנוי');
    } finally {
      setCancelling(false);
    }
  };

  // חישוב עלות ביטול מוקדם — רלוונטי רק למנוי רב-חודשי קיים עם הנחה.
  const cancellationInfo = useMemo(() => {
    if (!subscription?.subscriptionStartedAt || !subscription?.subscriptionEndsAt) return null;
    if (!tiers) return null;

    const start = new Date(subscription.subscriptionStartedAt);
    const end = new Date(subscription.subscriptionEndsAt);
    const now = new Date();

    const totalMonths = Math.round((end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const monthsUsed = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000)));

    if (totalMonths <= 1) return null;

    const lastPayment = subscription.recentPayments[0];
    const totalPaid = lastPayment ? Number(lastPayment.amount) : 0;

    if (!totalPaid) return null;

    const { adjustment, fairPrice, paidSoFar } = calculateCancellationAdjustment(
      PLANS,
      subscription.plan,
      totalMonths,
      monthsUsed,
      totalPaid
    );

    return {
      totalMonths,
      monthsUsed,
      monthsRemaining: totalMonths - monthsUsed,
      totalPaid,
      fairPrice,
      paidSoFar,
      adjustment,
      hasAdjustment: adjustment > 0,
    };
  }, [subscription, tiers, PLANS]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 ml-1" />פעיל</Badge>;
      case 'TRIALING':
        return <Badge className="bg-sky-100 text-sky-800"><Calendar className="h-3 w-3 ml-1" />תקופת ניסיון</Badge>;
      case 'PAST_DUE':
        return <Badge className="bg-red-100 text-red-800"><AlertCircle className="h-3 w-3 ml-1" />לתשלום</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-gray-100 text-gray-800"><XCircle className="h-3 w-3 ml-1" />בוטל</Badge>;
      case 'PAUSED':
        return <Badge className="bg-yellow-100 text-yellow-800">מושהה</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('he-IL');
  };

  // האם להציג את בלוק השדרוג לקליניקה — רק למטפל/ת עצמאי/ת (לא חבר/ת קליניקה).
  const isClinicMember =
    !!session?.user?.clinicRole ||
    session?.user?.role === 'CLINIC_OWNER' ||
    session?.user?.role === 'CLINIC_SECRETARY';
  const showClinicUpsell = !subscription?.billingPaidByClinic && !isClinicMember;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* כותרת הדף */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ניהול מנוי וחיוב</h1>
        <p className="text-muted-foreground">התוכנית שלך, יתרת ה-SMS והחיובים — הכל במקום אחד</p>
      </div>

      {/* באנר מבצע פעיל */}
      {activePromotion && (
        <Card className="border-green-400 bg-linear-to-l from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Megaphone className="h-6 w-6 text-green-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-green-900 dark:text-green-300 text-lg">
                  {activePromotion.title}
                </p>
                {activePromotion.description && (
                  <p className="text-sm text-green-800 dark:text-green-400 mt-1">
                    {activePromotion.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-3 mt-2 text-sm text-green-700 dark:text-green-400">
                  {activePromotion.discountPercent > 0 && (
                    <span className="font-semibold">{activePromotion.discountPercent}% הנחה</span>
                  )}
                  {activePromotion.validUntil && (
                    <span>בתוקף עד {new Date(activePromotion.validUntil).toLocaleDateString('he-IL')}</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* כשלון טעינת פרטי מנוי */}
      {subscriptionError && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-amber-900 dark:text-amber-300">
                  לא הצלחנו לטעון את פרטי המנוי שלך
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  ייתכן שתראה מידע חלקי. נסה לרענן את הדף.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void fetchSubscription(); }}
                  className="mt-3 border-amber-400 text-amber-700 hover:bg-amber-100"
                >
                  <RefreshCw className="h-4 w-4 ml-1" />
                  נסה שוב
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* באנר "המנוי משולם ע״י הקליניקה" */}
      {subscription?.billingPaidByClinic &&
        subscription?.subscriptionPausedReason === 'PAID_BY_CLINIC' && (
          <Card className="border-blue-500/40 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <Building2 className="h-5 w-5" />
                המנוי שלך משולם ע״י הקליניקה
              </CardTitle>
              <CardDescription>
                {subscription.clinicName
                  ? `הקליניקה ${subscription.clinicName} `
                  : 'הקליניקה '}
                משלמת על המנוי האישי שלך ב-MyTipul. אינך נדרש/ת לבצע תשלום אישי
                כל זמן השיוך לקליניקה. אם תעזב/י את הקליניקה — החיוב יחזור אליך
                אוטומטית.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

      {/* ========================================
          התוכנית שלי
          ======================================== */}
      {subscription && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  התוכנית שלי
                  <Badge variant="secondary" className="font-semibold tracking-wide">{PLAN_DISPLAY_NAME}</Badge>
                  {getStatusBadge(subscription.status)}
                </CardTitle>
                <CardDescription>כל היכולות של {PLAN_DISPLAY_NAME} במסלול אחד</CardDescription>
              </div>
              <div className="text-left">
                <div className="text-2xl font-bold">₪{Math.round(subscription.monthlyPrice)}</div>
                <div className="text-sm text-muted-foreground">לחודש</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">תאריך התחלה</div>
                <div className="font-medium">{formatDate(subscription.subscriptionStartedAt)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">תוקף עד</div>
                <div className="font-medium">{formatDate(subscription.subscriptionEndsAt)}</div>
              </div>
              {subscription.trialEndsAt && (
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">סיום ניסיון</div>
                  <div className="font-medium">{formatDate(subscription.trialEndsAt)}</div>
                </div>
              )}
            </div>

            {/* מה כלול בתוכנית */}
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm font-medium text-muted-foreground mb-2">מה כלול בתוכנית</div>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {MYTIPUL_FEATURES.map((feature, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {subscription.status === 'PAST_DUE' && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex gap-2 items-start">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">יש בעיה בתשלום</p>
                    <p className="text-sm text-red-700">נא לעדכן את פרטי התשלום כדי להמשיך להשתמש בשירות</p>
                  </div>
                </div>
              </div>
            )}

            {subscription.status === 'CANCELLED' && subscription.isActive && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex gap-2 items-start">
                  <Info className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">המנוי בוטל</p>
                    <p className="text-sm text-amber-700">
                      עדיין יש לך גישה מלאה עד {formatDate(subscription.subscriptionEndsAt)}.
                      תוכל לחדש בכל עת.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {subscription.pendingTier && subscription.pendingTierEffectiveAt && (
              <div className="mt-4 p-4 bg-sky-50 border border-sky-200 rounded-lg">
                <div className="flex gap-2 items-start">
                  <Info className="h-5 w-5 text-sky-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-sky-800">שינוי מתוכנן במנוי</p>
                    <p className="text-sm text-sky-700">
                      עדכון למנוי שלך ייכנס לתוקף בתאריך {formatDate(subscription.pendingTierEffectiveAt)}.
                      החיוב הבא יתעדכן אוטומטית.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* רשת ביטחון: מנוי "מושהה" שאינו "הקליניקה משלמת" (יש לו באנר נפרד למעלה)
                — שלא יישאר משתמש בלי הסבר ובלי דרך פעולה. */}
            {subscription.status === 'PAUSED' &&
              subscription.subscriptionPausedReason !== 'PAID_BY_CLINIC' && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex gap-2 items-start">
                  <Info className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">המנוי מושהה</p>
                    <p className="text-sm text-amber-700">
                      לפרטים או לחידוש המנוי, פנה/י לתמיכה ב-{' '}
                      <a href="mailto:support@mytipul.com" className="underline font-medium">support@mytipul.com</a>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* כפתורי פעולה */}
            <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
              {(subscription.status === 'ACTIVE' || subscription.status === 'TRIALING') && (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/dashboard/settings/subscription">
                      <CreditCard className="h-4 w-4 ml-1" />
                      ניהול תשלום וכרטיס שמור
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setShowCancelDialog(true)}
                  >
                    <XCircle className="h-4 w-4 ml-1" />
                    ביטול מנוי
                  </Button>
                </>
              )}
              {subscription.status === 'CANCELLED' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => { setTermsAccepted(false); setShowSubscribeDialog(true); }}
                >
                  <ArrowUpCircle className="h-4 w-4 ml-1" />
                  חדש מנוי
                </Button>
              )}
              {subscription.status === 'PAST_DUE' && (
                <Button variant="outline" size="sm" asChild>
                  <a href="/dashboard/settings/subscription">
                    <CreditCard className="h-4 w-4 ml-1" />
                    עדכן אמצעי תשלום
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================
          חבילות SMS
          ======================================== */}
      <SmsPackagesCard />

      {/* ========================================
          שדרוג לקליניקה — MyTipul Extra (מטפל עצמאי בלבד)
          ======================================== */}
      {showClinicUpsell && <ClinicUpgradeCard />}

      {/* ========================================
          היסטוריית תשלומים
          ======================================== */}
      {subscription?.recentPayments && subscription.recentPayments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              היסטוריית תשלומים
            </CardTitle>
            <CardDescription>התשלומים האחרונים שלך</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {subscription.recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      payment.status === 'PAID' ? 'bg-green-100' : 'bg-yellow-100'
                    }`}>
                      {payment.status === 'PAID' ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium">₪{payment.amount}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(payment.paidAt || payment.periodStart)}
                        {payment.periodStart && payment.periodEnd && (
                          <span className="mr-2 text-xs">
                            ({formatDate(payment.periodStart)} - {formatDate(payment.periodEnd)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {payment.invoiceUrl && (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={payment.invoiceUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4 ml-1" />
                        קבלה
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================
          עזרה ותמיכה
          ======================================== */}
      <Card className="bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-sky-600 mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-sky-900 dark:text-sky-300">צריך עזרה?</p>
              <p className="text-sky-800 dark:text-sky-400">
                שאלות לגבי המנוי, חיובים או חבילות? פנה אלינו ב-{' '}
                <a href="mailto:support@mytipul.com" className="underline font-medium">support@mytipul.com</a>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========================================
          דיאלוג חידוש מנוי
          ======================================== */}
      <AlertDialog open={showSubscribeDialog} onOpenChange={setShowSubscribeDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              חידוש מנוי {PLAN_DISPLAY_NAME}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-right">
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">תוכנית</span>
                    <span className="font-semibold text-foreground">{PLAN_DISPLAY_NAME}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-medium text-foreground">מחיר חודשי</span>
                    <span className="text-lg font-bold text-foreground">₪{Math.round(subscription?.monthlyPrice ?? 0)}</span>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span><strong className="text-foreground">חידוש אוטומטי:</strong> המנוי מתחדש כל חודש. ניתן לבטל בכל עת.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span><strong className="text-foreground">הנתונים שלך:</strong> נשמרים במלואם, גם לאחר ביטול.</span>
                  </p>
                </div>

                <div className="flex items-start gap-3 pt-2 border-t">
                  <Checkbox
                    id="terms-subscribe"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    className="mt-1"
                  />
                  <label htmlFor="terms-subscribe" className="text-sm leading-relaxed cursor-pointer text-foreground">
                    <span className="font-medium">קראתי ואני מאשר/ת את תנאי המנוי והשימוש</span>
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
            <AlertDialogAction
              disabled={!termsAccepted || subscribing}
              onClick={() => { void handleSubscribe(); }}
            >
              {subscribing ? (
                <><Loader2 className="h-4 w-4 ml-2 animate-spin" />מעבד...</>
              ) : (
                <>אשר ועבור לתשלום</>
              )}
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ========================================
          דיאלוג ביטול מנוי (עם חישוב הנחה)
          ======================================== */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול מנוי</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>האם אתה בטוח שברצונך לבטל את המנוי?</p>

                <div className="p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-sky-900 dark:text-sky-300 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    מה קורה כשמבטלים?
                  </p>
                  <ul className="text-sm text-sky-800 dark:text-sky-400 space-y-1 mr-5">
                    <li>• הגישה שלך ממשיכה עד {formatDate(subscription?.subscriptionEndsAt || null)}</li>
                    <li>• הנתונים נשמרים במלואם</li>
                    <li>• תוכל לחדש בכל עת</li>
                  </ul>
                </div>

                {cancellationInfo?.hasAdjustment && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-300 flex items-center gap-1">
                      <Info className="h-4 w-4" />
                      התאמת הנחה
                    </p>
                    <p className="text-sm text-amber-800 dark:text-amber-400">
                      רכשת מנוי ל-{cancellationInfo.totalMonths} חודשים עם הנחה.
                      מאחר שהשתמשת {cancellationInfo.monthsUsed} חודשים, ההנחה תחושב מחדש
                      לפי תקופת השימוש בפועל.
                    </p>
                    <div className="bg-white dark:bg-slate-900 rounded-md p-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">מחיר הוגן ל-{cancellationInfo.monthsUsed} חודשים:</span>
                        <span className="font-medium">₪{cancellationInfo.fairPrice}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">שולם עד כה (יחסי):</span>
                        <span className="font-medium">₪{cancellationInfo.paidSoFar}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="font-medium">הפרש לתשלום:</span>
                        <span className="font-bold text-amber-700 dark:text-amber-400">₪{cancellationInfo.adjustment}</span>
                      </div>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-500">
                      * הסכום יחויב בכרטיס האשראי שלך.
                    </p>
                  </div>
                )}

                {cancellationInfo && !cancellationInfo.hasAdjustment && cancellationInfo.totalMonths > 1 && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm text-green-800 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      אין הפרש לתשלום - הביטול ללא עלות נוספת.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>חזרה</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? (
                <><Loader2 className="h-4 w-4 ml-2 animate-spin" />מבטל...</>
              ) : cancellationInfo?.hasAdjustment ? (
                `בטל מנוי (חיוב ₪${cancellationInfo.adjustment})`
              ) : (
                'בטל מנוי'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
