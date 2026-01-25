"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface SubBox {
  value: number;
  label: string;
  href?: string;
  bgColor?: string;
  textColor?: string;
}

interface DashboardStatCardProps {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
  href: string;
  subBox?: SubBox | null;
}

export function DashboardStatCard({
  title,
  value,
  description,
  icon: Icon,
  href,
  subBox,
}: DashboardStatCardProps) {
  return (
    <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
      <Link href={href}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold">{value}</div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            {subBox && !subBox.href && (
              <div className={`${subBox.bgColor || 'bg-primary/10'} rounded-lg px-3 py-2 text-center`}>
                <div className={`text-lg font-bold ${subBox.textColor || 'text-primary'}`}>{subBox.value}</div>
                <p className={`text-xs ${subBox.textColor ? subBox.textColor + '/70' : 'text-primary/70'}`}>{subBox.label}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Link>
      {subBox && subBox.href && (
        <Link href={subBox.href} onClick={(e) => e.stopPropagation()}>
          <CardContent className="pt-0">
            <div className="flex justify-end">
              <div className={`${subBox.bgColor || 'bg-primary/10'} rounded-lg px-3 py-2 text-center hover:opacity-80 transition-opacity`}>
                <div className={`text-lg font-bold ${subBox.textColor || 'text-primary'}`}>{subBox.value}</div>
                <p className={`text-xs ${subBox.textColor ? subBox.textColor + '/70' : 'text-primary/70'}`}>{subBox.label}</p>
              </div>
            </div>
          </CardContent>
        </Link>
      )}
    </Card>
  );
}
