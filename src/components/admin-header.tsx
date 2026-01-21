"use client";

import { signOut } from "next-auth/react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, ArrowLeft, Shield } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface AdminHeaderProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role: "USER" | "ADMIN";
  };
}

export function AdminHeader({ user }: AdminHeaderProps) {
  const getInitials = (name?: string | null) => {
    if (!name) return "מ";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2);
  };

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-red-900/30 bg-slate-950/95 backdrop-blur px-6">
      <SidebarTrigger className="-mr-2 text-red-100" />
      
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-red-500" />
        <span className="font-semibold text-red-100">ממשק ניהול</span>
        <Badge variant="destructive" className="text-xs">Admin</Badge>
      </div>
      
      <div className="flex-1" />
      
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="text-red-200 hover:text-red-100 hover:bg-red-900/30">
          <Link href="/dashboard">
            <ArrowLeft className="ml-2 h-4 w-4" />
            חזרה לדשבורד
          </Link>
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-10 w-10 ring-2 ring-red-500/30">
                <AvatarImage src={user.image || undefined} alt={user.name || "Admin"} />
                <AvatarFallback className="bg-red-600/20 text-red-100">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard" className="cursor-pointer">
                <ArrowLeft className="ml-2 h-4 w-4" />
                <span>חזרה לדשבורד</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="ml-2 h-4 w-4" />
              <span>התנתקות</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

