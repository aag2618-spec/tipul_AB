'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  CreditCard, 
  CheckCircle, 
  AlertCircle, 
  Calendar,
  Download,
  Loader2,
  Crown,
  Zap,
  Building,
  XCircle,
  LinkIcon,
  Bell,
  MessageSquare,
  User,
  ArrowUpCircle,
  ArrowDownCircle,
  Info,
  Shield,
  FileText,
} from 'lucide-react';
import Link from 'next/link';
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

// ========================================
// הגדרות תמחור - מקום אחד לשנות הכל
// ========================================

const PLANS = {
  ESSENTIAL: {
    name: 'Essential',
    icon: Zap,
    color: 'bg-slate-100 text-slate-800',
    features: ['ניהול מטופלים', 'יומן פגישות', 'תשלומים וקבלות', 'תזכורות אוטומטיות'],
    pricing: {
      1:  117,
      3:  333,
      6:  631,
      12: 1170,
    },
  },
  PRO: {
    name: 'Pro',
    icon: Crown,
    color: 'bg-blue-100 text-blue-800',
    popular: true,
    features: ['הכל ב-Essential', 'AI עוזר חכם (GPT-4o-mini)', 'סיכומי פגישות', 'המלצות טיפוליות'],
    pricing: {
      1:  145,
      3:  413,
      6:  783,
      12: 1450,
    },
  },
  ENTERPRISE: {
    name: 'Enterprise',
    icon: Building,
    color: 'bg-purple-100 text-purple-800',
    features: ['הכל ב-Pro', 'AI מתקדם (GPT-4o)', 'אחסון ללא הגבלה', 'תמיכה עדיפותית'],
    pricing: {
      1:  220,
      3:  627,
      6:  1188,
      12: 2200,
    },
  },
};

type BillingMonths = 1 | 3 | 6 | 12;

const PERIOD_OPTIONS: { months: BillingMonths; label: string }[] = [
  { months: 1,  label: 'חודשי' },
  { months: 3,  label: '3 חודשים' },
  { months: 6,  label: 'חצי שנה' },
  { months: 12, label: 'שנתי' },
];

// ========================================
// חישוב מחיר הוגן לביטול מוקדם
// ========================================
// הלוגיקה: אם מנוי שנתי מבטל אחרי 5 חודשים,
// הוא משלם לפי המחיר הטוב ביותר שמתאים לשימוש שלו.
// (3 חודשים בחבילת 3 + 2 חודשים במחיר חודשי)

function calculateFairPrice(planKey: string, monthsUsed: number): number {
  const plan = PLANS[planKey as keyof typeof PLANS];
  if (!plan) return 0;
  
  if (monthsUsed >= 12) return plan.pricing[12];
  if (monthsUsed >= 6) return plan.pricing[6] + (monthsUsed - 6) * plan.pricing[1];
  if (monthsUsed >= 3) return plan.pricing[3] + (monthsUsed - 3) * plan.pricing[1];
  return monthsUsed * plan.pricing[1];
}

function calculateCancellationAdjustment(
  planKey: string,
  totalMonths: number,
  monthsUsed: number,
  totalPaid: number
): { adjustment: number; fairPrice: number; paidSoFar: number } {
  const fairPrice = calculateFairPrice(planKey, monthsUsed);
  const paidSoFar = Math.round((totalPaid / totalMonths) * monthsUsed);
  const adjustment = Math.max(0, fairPrice - paidSoFar);
  
  return { adjustment, fairPrice, paidSoFar };
}

// ========================================

interface SubscriptionStatus {
  plan: 'ESSENTIAL' | 'PRO' | 'ENTERPRISE';
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELLED' | 'PAUSED';
  isActive: boolean;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  monthlyPrice: number;
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
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingMonths, setBillingMonths] = useState<BillingMonths>(1);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsDetail, setShowTermsDetail] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      const res = await fetch('/api/subscription/status');
      if (res.ok) {
        const data = await res.json();
        setSubscription(data);
      }
    } catch (error) {
      console.error('Error fetching subscription:', error);
      toast.error('שגיאה בטעינת פרטי מנוי');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (plan: string) => {
    if (upgrading) return;
    setUpgrading(true);
    setSelectedPlan(plan);
    
    try {
      const res = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingMonths, termsAccepted: true }),
      });

      if (res.ok) {
        const data = await res.json();
        window.location.href = data.paymentUrl;
      } else {
        const error = await res.json();
        toast.error(error.error || 'שגיאה ביצירת מנוי');
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      toast.error('שגיאה ביצירת מנוי');
    } finally {
      setUpgrading(false);
      setSelectedPlan(null);
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
        toast.error(error.error || 'שגיאה בביטול המנוי');
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast.error('שגיאה בביטול המנוי');
    } finally {
      setCancelling(false);
    }
  };

  // חישובים
  const getTotalPrice = (planKey: string) => {
    const plan = PLANS[planKey as keyof typeof PLANS];
    return plan ? plan.pricing[billingMonths] : 0;
  };

  const getMonthlyPrice = (planKey: string) => {
    return Math.round(getTotalPrice(planKey) / billingMonths);
  };

  const getDiscount = (planKey: string) => {
    const plan = PLANS[planKey as keyof typeof PLANS];
    if (!plan || billingMonths === 1) return 0;
    const fullPrice = plan.pricing[1] * billingMonths;
    const actualPrice = plan.pricing[billingMonths];
    return Math.round(((fullPrice - actualPrice) / fullPrice) * 100);
  };

  const getSaving = (planKey: string) => {
    const plan = PLANS[planKey as keyof typeof PLANS];
    if (!plan || billingMonths === 1) return 0;
    return plan.pricing[1] * billingMonths - plan.pricing[billingMonths];
  };

  // חישוב עלות ביטול מוקדם
  const cancellationInfo = useMemo(() => {
    if (!subscription?.subscriptionStartedAt || !subscription?.subscriptionEndsAt) return null;
    
    const start = new Date(subscription.subscriptionStartedAt);
    const end = new Date(subscription.subscriptionEndsAt);
    const now = new Date();
    
    const totalMonths = Math.round((end.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000));
    const monthsUsed = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (30 * 24 * 60 * 60 * 1000)));
    
    // רק רלוונטי למנוי עם הנחה (תקופה > 1 חודש)
    if (totalMonths <= 1) return null;
    
    // חישוב הסכום ששולם
    const lastPayment = subscription.recentPayments[0];
    const totalPaid = lastPayment ? Number(lastPayment.amount) : 0;
    
    if (!totalPaid) return null;
    
    const { adjustment, fairPrice, paidSoFar } = calculateCancellationAdjustment(
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
  }, [subscription]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 ml-1" />פעיל</Badge>;
      case 'TRIALING':
        return <Badge className="bg-blue-100 text-blue-800"><Calendar className="h-3 w-3 ml-1" />תקופת ניסיון</Badge>;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* ========================================
          כותרת הדף
          ======================================== */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ניהול מנוי וחיוב</h1>
        <p className="text-muted-foreground">צפייה, שדרוג, שינוי ותנאי המנוי שלך - הכל במקום אחד</p>
      </div>

      {/* Navigation */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings"><User className="h-4 w-4" />פרופיל</Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/notifications"><Bell className="h-4 w-4" />התראות</Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/communication"><MessageSquare className="h-4 w-4" />תקשורת</Link>
        </Button>
        <Button variant="outline" size="sm" asChild className="gap-2">
          <Link href="/dashboard/settings/integrations"><LinkIcon className="h-4 w-4" />אינטגרציות</Link>
        </Button>
        <Button variant="default" size="sm" className="gap-2">
          <CreditCard className="h-4 w-4" />
          מנוי וחיוב
        </Button>
      </div>

      {/* ========================================
          סעיף 1: המנוי הנוכחי שלי
          ======================================== */}
      {subscription && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  המנוי הנוכחי שלי
                  {getStatusBadge(subscription.status)}
                </CardTitle>
                <CardDescription>
                  מסלול {PLANS[subscription.plan]?.name || subscription.plan}
                </CardDescription>
              </div>
              <div className="text-left">
                <div className="text-2xl font-bold">₪{subscription.monthlyPrice}</div>
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

            {/* כפתורי פעולה */}
            <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
              {subscription.status === 'CANCELLED' && (
                <Button variant="default" size="sm" onClick={() => {
                  const plansSection = document.getElementById('plans-section');
                  plansSection?.scrollIntoView({ behavior: 'smooth' });
                }}>
                  <ArrowUpCircle className="h-4 w-4 ml-1" />
                  חדש מנוי
                </Button>
              )}
              {(subscription.status === 'ACTIVE' || subscription.status === 'TRIALING') && (
                <>
                  <Button variant="outline" size="sm" onClick={() => {
                    const plansSection = document.getElementById('plans-section');
                    plansSection?.scrollIntoView({ behavior: 'smooth' });
                  }}>
                    <ArrowUpCircle className="h-4 w-4 ml-1" />
                    שדרג מסלול
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================
          סעיף 2: בחירת מסלול (שדרוג / רכישה)
          ======================================== */}
      <div id="plans-section" className="space-y-4 scroll-mt-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-semibold">
              {subscription?.isActive ? 'שדרג את המסלול שלך' : 'בחר מסלול'}
            </h2>
            <p className="text-sm text-muted-foreground">כל המסלולים כוללים 14 ימי ניסיון חינם</p>
          </div>
        </div>

        {/* בחירת תקופה */}
        <div className="space-y-2">
          <div className="flex justify-center">
            <div className="inline-flex items-center bg-muted rounded-lg p-1 gap-1">
              {PERIOD_OPTIONS.map((option) => {
                const isActive = billingMonths === option.months;
                const disc = option.months > 1 ? (() => {
                  const proMonthly = PLANS.PRO.pricing[1];
                  const proTotal = PLANS.PRO.pricing[option.months];
                  return Math.round(((proMonthly * option.months - proTotal) / (proMonthly * option.months)) * 100);
                })() : 0;
                
                return (
                  <button
                    key={option.months}
                    onClick={() => setBillingMonths(option.months)}
                    className={`px-4 py-2.5 rounded-md text-sm font-medium transition-all relative ${
                      isActive 
                        ? 'bg-background shadow-sm text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {option.label}
                    {disc > 0 && (
                      <span className="absolute -top-2 -left-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        -{disc}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {billingMonths === 1 && 'מתחדש אוטומטית כל חודש. ניתן לבטל בכל עת.'}
            {billingMonths === 3 && 'מתחדש כל 3 חודשים. חיסכון עם התחייבות קצרה.'}
            {billingMonths === 6 && 'מתחדש כל חצי שנה. חיסכון משמעותי.'}
            {billingMonths === 12 && 'מתחדש כל שנה. החיסכון הכי גדול!'}
          </p>
        </div>

        {/* כרטיסי מסלולים */}
        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(PLANS).map(([key, plan]) => {
            const Icon = plan.icon;
            const isCurrent = subscription?.plan === key;
            const discount = getDiscount(key);
            const monthlyAvg = getMonthlyPrice(key);
            const saving = getSaving(key);
            const isUpgrade = subscription?.plan && 
              PLANS[subscription.plan as keyof typeof PLANS]?.pricing[1] < plan.pricing[1];
            
            return (
              <Card key={key} className={`relative ${isCurrent ? 'border-primary border-2' : ''} ${'popular' in plan && plan.popular && !isCurrent ? 'border-blue-300 border-2' : ''}`}>
                {'popular' in plan && plan.popular && !isCurrent && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-primary">הכי פופולרי</Badge>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-3 left-4">
                    <Badge className="bg-green-600">המסלול שלך</Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg ${plan.color} flex items-center justify-center`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold">₪{monthlyAvg}</span>
                        <span className="text-sm text-muted-foreground">/חודש</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* פרטי מחיר ותקופה */}
                  {billingMonths > 1 && (
                    <div className="mb-3 p-2.5 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md">
                      <p className="text-xs text-green-700 dark:text-green-400 font-medium">
                        ₪{getTotalPrice(key)} לתקופה של {billingMonths} חודשים
                      </p>
                      {discount > 0 && (
                        <p className="text-xs text-green-600 dark:text-green-500">
                          חיסכון של ₪{saving} ({discount}% הנחה) לעומת חודשי
                        </p>
                      )}
                    </div>
                  )}

                  {/* פיצ'רים */}
                  <ul className="space-y-2 text-sm mb-4">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  
                  {/* כפתור פעולה - שדרוג, הורדה, או נוכחי */}
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      <CheckCircle className="h-4 w-4 ml-1" />
                      המסלול הנוכחי
                    </Button>
                  ) : isUpgrade ? (
                    <Button 
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      onClick={() => { setTermsAccepted(false); setShowTermsDetail(false); setShowUpgradeDialog(key); }}
                      disabled={upgrading}
                    >
                      <ArrowUpCircle className="h-4 w-4 ml-1" />שדרג עכשיו
                    </Button>
                  ) : (
                    <Button 
                      variant="outline"
                      className="w-full"
                      onClick={() => { setTermsAccepted(false); setShowTermsDetail(false); setShowUpgradeDialog(key); }}
                      disabled={upgrading}
                    >
                      <ArrowDownCircle className="h-4 w-4 ml-1" />עבור למסלול זה
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ========================================
          דיאלוג אישור שדרוג + תנאי שימוש
          ======================================== */}
      <AlertDialog open={!!showUpgradeDialog} onOpenChange={(open) => { if (!open) setShowUpgradeDialog(null); }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {showUpgradeDialog && PLANS[showUpgradeDialog as keyof typeof PLANS] && (() => {
                const plan = PLANS[showUpgradeDialog as keyof typeof PLANS];
                const Icon = plan.icon;
                return <><Icon className="h-5 w-5" />{subscription?.isActive ? 'שדרוג' : 'רכישת'} מסלול {plan.name}</>;
              })()}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-right">
                {/* סיכום מחיר */}
                {showUpgradeDialog && (
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">מסלול</span>
                      <span className="font-semibold text-foreground">{PLANS[showUpgradeDialog as keyof typeof PLANS]?.name}</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">תקופה</span>
                      <span className="font-medium text-foreground">{PERIOD_OPTIONS.find(p => p.months === billingMonths)?.label}</span>
                    </div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-muted-foreground">מחיר לחודש</span>
                      <span className="font-medium text-foreground">₪{getMonthlyPrice(showUpgradeDialog)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium text-foreground">סה&quot;כ לתשלום</span>
                      <span className="text-lg font-bold text-foreground">₪{getTotalPrice(showUpgradeDialog)}</span>
                    </div>
                    {getDiscount(showUpgradeDialog) > 0 && (
                      <div className="mt-2 text-xs text-green-600 text-left">
                        חיסכון של ₪{getSaving(showUpgradeDialog)} ({getDiscount(showUpgradeDialog)}% הנחה)
                      </div>
                    )}
                  </div>
                )}

                {/* תנאים */}
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span><strong className="text-foreground">חידוש אוטומטי:</strong> המנוי מתחדש אוטומטית בסוף כל תקופה. ניתן לבטל בכל עת.</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span><strong className="text-foreground">ניסיון חינם:</strong> 14 ימי ניסיון ללא התחייבות. ניתן לבטל ללא חיוב.</span>
                  </p>
                  {billingMonths > 1 && (
                    <p className="flex items-start gap-2">
                      <Shield className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <span><strong className="text-foreground">הנחה תקופתית:</strong> בביטול מוקדם, ההנחה תחושב מחדש לפי תקופת השימוש בפועל - תמיד לפי המחיר הטוב ביותר.</span>
                    </p>
                  )}
                  <p className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    <span><strong className="text-foreground">הנתונים שלך:</strong> גם לאחר ביטול, הנתונים נשמרים ותוכל לגשת אליהם בכל עת.</span>
                  </p>
                </div>

                {/* Checkbox */}
                <div className="flex items-start gap-3 pt-2 border-t">
                  <Checkbox 
                    id="terms-dialog"
                    checked={termsAccepted}
                    onCheckedChange={(checked) => setTermsAccepted(checked === true)}
                    className="mt-1"
                  />
                  <label htmlFor="terms-dialog" className="text-sm leading-relaxed cursor-pointer text-foreground">
                    <span className="font-medium">קראתי ואני מאשר/ת את תנאי המנוי והשימוש</span>
                  </label>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
            <AlertDialogAction
              disabled={!termsAccepted || upgrading}
              onClick={() => {
                if (showUpgradeDialog) {
                  handleUpgrade(showUpgradeDialog);
                  setShowUpgradeDialog(null);
                }
              }}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {upgrading ? (
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
          סעיף 4: היסטוריית תשלומים
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
          סעיף 5: עזרה ותמיכה
          ======================================== */}
      <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-blue-900 dark:text-blue-300">צריך עזרה?</p>
              <p className="text-blue-800 dark:text-blue-400">
                שאלות לגבי המנוי, שדרוגים או חיובים? פנה אלינו ב-{' '}
                <a href="mailto:support@tipul.co.il" className="underline font-medium">support@tipul.co.il</a>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                
                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-300 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    מה קורה כשמבטלים?
                  </p>
                  <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1 mr-5">
                    <li>• הגישה שלך ממשיכה עד {formatDate(subscription?.subscriptionEndsAt || null)}</li>
                    <li>• הנתונים נשמרים במלואם</li>
                    <li>• תוכל לחדש בכל עת</li>
                  </ul>
                </div>

                {/* חישוב התאמת הנחה */}
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
