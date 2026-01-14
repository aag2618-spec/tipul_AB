"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Activity, TrendingUp, TrendingDown, DollarSign, Clock, Zap } from "lucide-react";
import { format } from "date-fns";

interface ApiLog {
  id: string;
  endpoint: string;
  method: string;
  tokensUsed: number | null;
  cost: number | null;
  success: boolean;
  durationMs: number | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

interface UsageStats {
  totalTokens: number;
  totalCost: number;
  avgDuration: number;
}

interface UsageByEndpoint {
  endpoint: string;
  _count: number;
  _sum: {
    tokensUsed: number | null;
    cost: number | null;
  };
}

interface UsageByUser {
  userId: string;
  _count: number;
  _sum: {
    tokensUsed: number | null;
    cost: number | null;
  };
  user: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

export default function AdminApiUsagePage() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [usageByEndpoint, setUsageByEndpoint] = useState<UsageByEndpoint[]>([]);
  const [usageByUser, setUsageByUser] = useState<UsageByUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/admin/api-usage?limit=100");
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
        setStats(data.stats);
        setUsageByEndpoint(data.usageByEndpoint);
        setUsageByUser(data.usageByUser);
      }
    } catch (error) {
      console.error("Failed to fetch API usage:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const getEndpointLabel = (endpoint: string) => {
    if (endpoint.includes("transcribe")) return "תמלול";
    if (endpoint.includes("analyze")) return "ניתוח";
    return endpoint;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">שימוש ב-API</h1>
        <p className="text-slate-400 mt-1">מעקב אחרי קריאות API במערכת</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">סה"כ טוקנים</CardTitle>
            <Zap className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {(stats?.totalTokens || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">עלות משוערת</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              ${(stats?.totalCost || 0).toFixed(2)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">זמן תגובה ממוצע</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {Math.round(stats?.avgDuration || 0)} ms
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage by Endpoint */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">שימוש לפי Endpoint</CardTitle>
            <CardDescription>חלוקת השימוש לפי סוג פעולה</CardDescription>
          </CardHeader>
          <CardContent>
            {usageByEndpoint.length === 0 ? (
              <p className="text-slate-500 text-center py-4">אין נתונים</p>
            ) : (
              <div className="space-y-4">
                {usageByEndpoint.map((item) => {
                  const totalCalls = usageByEndpoint.reduce((sum, i) => sum + i._count, 0);
                  const percentage = totalCalls > 0 ? (item._count / totalCalls) * 100 : 0;
                  
                  return (
                    <div key={item.endpoint} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white">{getEndpointLabel(item.endpoint)}</span>
                        <span className="text-sm text-slate-400">{item._count} קריאות</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-amber-500 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">משתמשים מובילים</CardTitle>
            <CardDescription>משתמשים עם הכי הרבה קריאות API</CardDescription>
          </CardHeader>
          <CardContent>
            {usageByUser.length === 0 ? (
              <p className="text-slate-500 text-center py-4">אין נתונים</p>
            ) : (
              <div className="space-y-3">
                {usageByUser.slice(0, 5).map((item, index) => (
                  <div key={item.userId} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-slate-500">#{index + 1}</span>
                      <div>
                        <p className="font-medium text-white">{item.user?.name || "ללא שם"}</p>
                        <p className="text-sm text-slate-500">{item.user?.email}</p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-white">{item._count}</p>
                      <p className="text-xs text-slate-500">קריאות</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Logs */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">לוג קריאות אחרונות</CardTitle>
          <CardDescription>100 הקריאות האחרונות</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>אין קריאות API</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-400">סטטוס</TableHead>
                  <TableHead className="text-slate-400">Endpoint</TableHead>
                  <TableHead className="text-slate-400">משתמש</TableHead>
                  <TableHead className="text-slate-400">טוקנים</TableHead>
                  <TableHead className="text-slate-400">עלות</TableHead>
                  <TableHead className="text-slate-400">זמן</TableHead>
                  <TableHead className="text-slate-400">תאריך</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="border-slate-800">
                    <TableCell>
                      {log.success ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-slate-300">
                        {getEndpointLabel(log.endpoint)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {log.user?.name || log.user?.email || "-"}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {log.tokensUsed?.toLocaleString() || "-"}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {log.cost ? `$${log.cost.toFixed(4)}` : "-"}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      {log.durationMs ? `${log.durationMs}ms` : "-"}
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {format(new Date(log.createdAt), "dd/MM HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
