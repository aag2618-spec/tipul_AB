"use client";
import { useState, useCallback } from "react";
import { useApiCall } from "./use-api-call";

interface Payment {
  id: string;
  amount: number;
  expectedAmount: number | null;
  method: string;
  status: string;
  paymentType: string;
  createdAt: string;
  paidAt: string | null;
  receiptError?: string;
  client?: {
    id: string;
    name: string;
  } | null;
  session?: {
    id: string;
    startTime: string;
  } | null;
}

interface CreatePaymentParams {
  clientId: string;
  sessionId?: string | null;
  amount: number;
  expectedAmount?: number;
  paymentType?: "FULL" | "PARTIAL" | "ADVANCE";
  method?: string;
  status?: string;
  notes?: string;
  creditUsed?: number;
  issueReceipt?: boolean;
}

interface ClientDebtSummary {
  totalDebt: number;
  unpaidSessions: Array<{
    sessionId: string;
    paymentId: string;
    amount: number;
    expectedAmount: number;
    sessionDate: string;
  }>;
}

export function usePayments() {
  const [payments, setPayments] = useState<Payment[]>([]);

  const fetchApi = useApiCall<Payment[]>();
  const createApi = useApiCall<Payment>({
    successMessage: "התשלום נוצר בהצלחה",
  });
  const debtApi = useApiCall<ClientDebtSummary>();

  const fetchPayments = useCallback(async () => {
    const data = await fetchApi.execute("/api/payments");
    if (data) {
      setPayments(data);
    }
    return data;
  }, [fetchApi]);

  const createPayment = useCallback(async (params: CreatePaymentParams) => {
    const result = await createApi.execute("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (result) {
      setPayments(prev => [result, ...prev]);
    }
    return result;
  }, [createApi]);

  const getClientDebt = useCallback(async (clientId: string) => {
    const data = await debtApi.execute(`/api/payments/client-debt/${clientId}`);
    return data;
  }, [debtApi]);

  return {
    payments,
    setPayments,
    fetchPayments,
    createPayment,
    getClientDebt,
    isLoading: fetchApi.isLoading,
    isCreating: createApi.isLoading,
    isLoadingDebt: debtApi.isLoading,
    error: fetchApi.error,
  };
}
