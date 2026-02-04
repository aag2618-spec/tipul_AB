"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import Link from "next/link";

interface User {
  id: string;
  name: string;
  email: string;
  aiTier: string;
  createdAt: string;
  aiUsageStats: {
    currentMonthCalls: number;
    currentMonthCost: number;
    dailyCalls: number;
  } | null;
  _count: {
    clients: number;
  };
}

export default function AdminUsersPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<string>("usage");

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterAndSortUsers();
  }, [users, searchQuery, tierFilter, sortBy]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
        setFilteredUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndSortUsers = () => {
    let filtered = [...users];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(u =>
        u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Tier filter
    if (tierFilter !== "ALL") {
      filtered = filtered.filter(u => u.aiTier === tierFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "usage":
          return (b.aiUsageStats?.currentMonthCalls || 0) - (a.aiUsageStats?.currentMonthCalls || 0);
        case "cost":
          return (b.aiUsageStats?.currentMonthCost || 0) - (a.aiUsageStats?.currentMonthCost || 0);
        case "clients":
          return (b._count?.clients || 0) - (a._count?.clients || 0);
        case "name":
          return (a.name || '').localeCompare(b.name || '');
        default:
          return 0;
      }
    });

    setFilteredUsers(filtered);
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'ENTERPRISE':
        return <Badge>🥇 ארגוני</Badge>;
      case 'PRO':
        return <Badge variant="secondary">🥈 מקצועי</Badge>;
      default:
        return <Badge variant="outline">🥉 בסיסי</Badge>;
    }
  };

  const getTierPrice = (tier: string) => {
    switch (tier) {
      case 'ENTERPRISE':
        return '220₪';
      case 'PRO':
        return '145₪';
      default:
        return '117₪';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalRevenue = users.reduce((sum, u) => {
    const price = u.aiTier === 'ENTERPRISE' ? 220 : u.aiTier === 'PRO' ? 145 : 117;
    return sum + price;
  }, 0);

  const totalCost = users.reduce((sum, u) => sum + Number(u.aiUsageStats?.currentMonthCost || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">👥 ניהול משתמשים</h1>
          <p className="text-muted-foreground mt-1">
            {users.length} משתמשים במערכת
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/ai-usage">
            חזרה לדשבורד
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">הכנסות חודשיות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRevenue.toLocaleString()}₪</div>
            <p className="text-xs text-muted-foreground mt-1">
              מכל המנויים
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">עלויות AI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCost.toFixed(2)}₪</div>
            <p className="text-xs text-muted-foreground mt-1">
              החודש
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">רווח נקי</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {(totalRevenue - totalCost).toFixed(2)}₪
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round((totalRevenue - totalCost) / totalRevenue * 100)}% מרווח
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>סינון וחיפוש</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חפש לפי שם או מייל..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>

            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger>
                <SelectValue placeholder="כל התוכניות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">כל התוכניות</SelectItem>
                <SelectItem value="ESSENTIAL">Essential</SelectItem>
                <SelectItem value="PRO">Professional</SelectItem>
                <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger>
                <SelectValue placeholder="מיון לפי" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usage">שימוש AI</SelectItem>
                <SelectItem value="cost">עלות</SelectItem>
                <SelectItem value="clients">מספר מטופלים</SelectItem>
                <SelectItem value="name">שם</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => {
              setSearchQuery("");
              setTierFilter("ALL");
              setSortBy("usage");
            }}>
              נקה סינון
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>רשימת משתמשים ({filteredUsers.length})</CardTitle>
          <CardDescription>
            לחץ על משתמש לפרטים מלאים
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>משתמש</TableHead>
                  <TableHead>תוכנית</TableHead>
                  <TableHead>מטופלים</TableHead>
                  <TableHead>קריאות החודש</TableHead>
                  <TableHead>קריאות היום</TableHead>
                  <TableHead>עלות החודש</TableHead>
                  <TableHead>הכנסה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      לא נמצאו משתמשים
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const monthCalls = user.aiUsageStats?.currentMonthCalls || 0;
                    const dailyCalls = user.aiUsageStats?.dailyCalls || 0;
                    const cost = Number(user.aiUsageStats?.currentMonthCost || 0);
                    const revenue = user.aiTier === 'ENTERPRISE' ? 220 : user.aiTier === 'PRO' ? 145 : 117;
                    const profit = revenue - cost;

                    return (
                      <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <div>
                            <p className="font-medium">{user.name || "ללא שם"}</p>
                            {user.email ? (
                              <a 
                                href={`mailto:${user.email}`}
                                className="text-xs text-blue-500 hover:text-blue-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {user.email}
                              </a>
                            ) : (
                              <p className="text-xs text-muted-foreground">ללא מייל</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getTierBadge(user.aiTier)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {user._count?.clients || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {monthCalls}
                            {monthCalls > 500 && (
                              <AlertCircle className="h-4 w-4 text-orange-500" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{dailyCalls}</TableCell>
                        <TableCell>{cost.toFixed(2)}₪</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className={profit > 0 ? 'text-green-600 font-medium' : ''}>
                              {revenue}₪
                            </span>
                            {profit > 0 && <TrendingUp className="h-4 w-4 text-green-500" />}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
