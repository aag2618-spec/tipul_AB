"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  Crown, 
  Sparkles, 
  User, 
  AlertCircle, 
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface SubscriptionBadgeProps {
  tier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  status?: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";
  showStatus?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const TIER_CONFIG = {
  ESSENTIAL: {
    label: "בסיסי",
    labelEn: "Essential",
    icon: User,
    emoji: "🥉",
    bgColor: "bg-gray-100",
    textColor: "text-gray-700",
    borderColor: "border-gray-300",
  },
  PRO: {
    label: "מקצועי",
    labelEn: "Professional",
    icon: Sparkles,
    emoji: "🥈",
    bgColor: "bg-blue-100",
    textColor: "text-blue-700",
    borderColor: "border-blue-300",
  },
  ENTERPRISE: {
    label: "ארגוני",
    labelEn: "Enterprise",
    icon: Crown,
    emoji: "🥇",
    bgColor: "bg-purple-100",
    textColor: "text-purple-700",
    borderColor: "border-purple-300",
  },
};

const STATUS_CONFIG = {
  ACTIVE: {
    label: "פעיל",
    icon: CheckCircle,
    color: "text-green-600",
  },
  TRIALING: {
    label: "ניסיון",
    icon: Clock,
    color: "text-blue-600",
  },
  PAST_DUE: {
    label: "חוב",
    icon: AlertCircle,
    color: "text-red-600",
  },
  CANCELLED: {
    label: "מבוטל",
    icon: XCircle,
    color: "text-gray-500",
  },
  PAUSED: {
    label: "מושהה",
    icon: Clock,
    color: "text-yellow-600",
  },
};

export function SubscriptionBadge({
  tier,
  status = "ACTIVE",
  showStatus = false,
  size = "md",
  className,
}: SubscriptionBadgeProps) {
  const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.ESSENTIAL;
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.ACTIVE;
  const TierIcon = tierConfig.icon;
  const StatusIcon = statusConfig.icon;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5",
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Badge
        className={cn(
          "gap-1 border",
          tierConfig.bgColor,
          tierConfig.textColor,
          tierConfig.borderColor,
          sizeClasses[size]
        )}
      >
        <span>{tierConfig.emoji}</span>
        <span>{tierConfig.label}</span>
      </Badge>
      
      {showStatus && status !== "ACTIVE" && (
        <Badge
          variant="outline"
          className={cn(
            "gap-1",
            statusConfig.color,
            sizeClasses[size]
          )}
        >
          <StatusIcon className="h-3 w-3" />
          <span>{statusConfig.label}</span>
        </Badge>
      )}
    </div>
  );
}

// גרסה קומפקטית - רק אייקון
export function SubscriptionIcon({
  tier,
  className,
}: {
  tier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  className?: string;
}) {
  const config = TIER_CONFIG[tier] || TIER_CONFIG.ESSENTIAL;
  return (
    <span className={cn("text-lg", className)} title={config.label}>
      {config.emoji}
    </span>
  );
}

// תצוגה מלאה עם מחיר
export function SubscriptionCard({
  tier,
  status = "ACTIVE",
  price,
  expiresAt,
}: {
  tier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  status?: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";
  price?: number;
  expiresAt?: Date | string;
}) {
  const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.ESSENTIAL;
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.ACTIVE;
  const TierIcon = tierConfig.icon;
  const StatusIcon = statusConfig.icon;

  return (
    <div className={cn(
      "p-4 rounded-lg border-2",
      tierConfig.bgColor,
      tierConfig.borderColor
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{tierConfig.emoji}</span>
          <div>
            <h3 className={cn("font-bold", tierConfig.textColor)}>
              {tierConfig.label}
            </h3>
            <p className="text-sm text-muted-foreground">
              {tierConfig.labelEn}
            </p>
          </div>
        </div>
        
        {price && (
          <div className="text-left">
            <p className={cn("text-2xl font-bold", tierConfig.textColor)}>
              ₪{price}
            </p>
            <p className="text-xs text-muted-foreground">לחודש</p>
          </div>
        )}
      </div>
      
      <div className="mt-3 pt-3 border-t border-current/10 flex items-center justify-between">
        <div className={cn("flex items-center gap-1 text-sm", statusConfig.color)}>
          <StatusIcon className="h-4 w-4" />
          <span>{statusConfig.label}</span>
        </div>
        
        {expiresAt && (
          <p className="text-xs text-muted-foreground">
            {status === "ACTIVE" ? "מתחדש: " : "פג: "}
            {new Date(expiresAt).toLocaleDateString("he-IL")}
          </p>
        )}
      </div>
    </div>
  );
}
