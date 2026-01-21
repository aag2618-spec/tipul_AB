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
import { Progress } from "@/components/ui/progress";
import { Loader2, HardDrive, FileText, Mic, Database } from "lucide-react";

interface StorageUser {
  id: string;
  name: string | null;
  email: string | null;
  documentsCount: number;
  recordingsCount: number;
  documentsStorageMB: number;
  recordingsStorageMB: number;
  totalStorageMB: number;
  totalStorageGB: number;
}

interface StorageTotals {
  totalDocuments: number;
  totalRecordings: number;
  totalStorageMB: number;
  totalStorageGB: number;
}

export default function AdminStoragePage() {
  const [users, setUsers] = useState<StorageUser[]>([]);
  const [totals, setTotals] = useState<StorageTotals | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/admin/storage");
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
        setTotals(data.totals);
      }
    } catch (error) {
      console.error("Failed to fetch storage:", error);
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

  const maxStorageMB = Math.max(...users.map(u => u.totalStorageMB), 1);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">ניהול אחסון</h1>
        <p className="text-slate-400 mt-1">סקירת שימוש באחסון לפי משתמש</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">סה"כ אחסון</CardTitle>
            <Database className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {(totals?.totalStorageGB || 0).toFixed(2)} GB
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {(totals?.totalStorageMB || 0).toFixed(0)} MB
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">מסמכים</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {totals?.totalDocuments || 0}
            </div>
            <p className="text-xs text-slate-500 mt-1">קבצים</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">הקלטות</CardTitle>
            <Mic className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {totals?.totalRecordings || 0}
            </div>
            <p className="text-xs text-slate-500 mt-1">קבצי אודיו</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">ממוצע למשתמש</CardTitle>
            <HardDrive className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {users.length > 0 
                ? ((totals?.totalStorageMB || 0) / users.length).toFixed(1)
                : 0
              } MB
            </div>
            <p className="text-xs text-slate-500 mt-1">לכל משתמש</p>
          </CardContent>
        </Card>
      </div>

      {/* Storage by User */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">שימוש באחסון לפי משתמש</CardTitle>
          <CardDescription>משתמשים ממוינים לפי נפח אחסון</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>אין נתוני אחסון</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-400">משתמש</TableHead>
                  <TableHead className="text-slate-400">מסמכים</TableHead>
                  <TableHead className="text-slate-400">הקלטות</TableHead>
                  <TableHead className="text-slate-400 w-[300px]">שימוש באחסון</TableHead>
                  <TableHead className="text-slate-400">סה"כ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const percentage = (user.totalStorageMB / maxStorageMB) * 100;
                  const docPercentage = user.totalStorageMB > 0 
                    ? (user.documentsStorageMB / user.totalStorageMB) * 100 
                    : 0;
                  
                  return (
                    <TableRow key={user.id} className="border-slate-800">
                      <TableCell>
                        <div>
                          <p className="font-medium text-white">{user.name || "ללא שם"}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <span className="text-slate-300">{user.documentsCount}</span>
                          <span className="text-xs text-slate-500">
                            ({user.documentsStorageMB.toFixed(1)} MB)
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mic className="h-4 w-4 text-green-500" />
                          <span className="text-slate-300">{user.recordingsCount}</span>
                          <span className="text-xs text-slate-500">
                            ({user.recordingsStorageMB.toFixed(1)} MB)
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative">
                            <div 
                              className="absolute h-full bg-blue-500 rounded-full"
                              style={{ width: `${(docPercentage / 100) * percentage}%` }}
                            />
                            <div 
                              className="absolute h-full bg-green-500 rounded-full"
                              style={{ 
                                width: `${((100 - docPercentage) / 100) * percentage}%`,
                                left: `${(docPercentage / 100) * percentage}%`
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-blue-500" />
                              מסמכים
                            </span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              הקלטות
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline"
                          className={
                            user.totalStorageMB > 100 
                              ? "border-red-500 text-red-500" 
                              : user.totalStorageMB > 50 
                                ? "border-yellow-500 text-yellow-500"
                                : "border-green-500 text-green-500"
                          }
                        >
                          {user.totalStorageMB.toFixed(1)} MB
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
