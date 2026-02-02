"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import Link from "next/link";

export function UserTierBadge() {
  const [tier, setTier] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTier();
  }, []);

  const fetchTier = async () => {
    try {
      const response = await fetch('/api/user/tier');
      if (response.ok) {
        const data = await response.json();
        setTier(data.aiTier);
      }
    } catch (error) {
      console.error('Failed to fetch tier:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <Loader2 className="h-3 w-3 animate-spin" />;
  }

  if (!tier) return null;

  const getTierDisplay = () => {
    switch (tier) {
      case 'ENTERPRISE':
        return { label: '🥇 Enterprise', variant: 'default' as const };
      case 'PRO':
        return { label: '🥈 Pro', variant: 'secondary' as const };
      default:
        return { label: '🥉 Essential', variant: 'outline' as const };
    }
  };

  const tierDisplay = getTierDisplay();

  return (
    <Link href="/dashboard/settings/ai-assistant">
      <Badge variant={tierDisplay.variant} className="text-xs cursor-pointer hover:opacity-80">
        {tierDisplay.label}
      </Badge>
    </Link>
  );
}
