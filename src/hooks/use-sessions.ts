"use client";
import { useState, useCallback } from "react";
import { useApiCall } from "./use-api-call";
import type { Session } from "@/components/sessions/session-card";

interface FetchSessionsParams {
  clientId?: string;
  startDate?: string;
  endDate?: string;
}

interface UpdateSessionParams {
  status?: string;
  startTime?: string;
  endTime?: string;
  type?: string;
  price?: number;
  location?: string;
  notes?: string;
  createPayment?: boolean;
  markAsPaid?: boolean;
}

interface CancelSessionParams {
  cancellationReason?: string;
}

interface SessionStatusUpdateResult {
  id: string;
  status: string;
  [key: string]: unknown;
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);

  const fetchApi = useApiCall<Session[]>();
  const statusApi = useApiCall<SessionStatusUpdateResult>();
  const updateApi = useApiCall<SessionStatusUpdateResult>();
  const cancelApi = useApiCall<SessionStatusUpdateResult>({
    successMessage: "הפגישה בוטלה",
  });
  const approveApi = useApiCall<SessionStatusUpdateResult>({
    successMessage: "הפגישה אושרה!",
  });

  const fetchSessions = useCallback(async (params?: FetchSessionsParams) => {
    const searchParams = new URLSearchParams();
    if (params?.clientId) searchParams.set("clientId", params.clientId);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);

    const query = searchParams.toString();
    const url = `/api/sessions${query ? `?${query}` : ""}`;

    const data = await fetchApi.execute(url);
    if (data) {
      setSessions(data);
    }
    return data;
  }, [fetchApi]);

  const updateSession = useCallback(async (
    sessionId: string,
    params: UpdateSessionParams
  ) => {
    const result = await updateApi.execute(`/api/sessions/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (result) {
      setSessions(prev =>
        prev.map(s => s.id === sessionId ? { ...s, ...params } : s)
      );
    }
    return result;
  }, [updateApi]);

  const cancelSession = useCallback(async (
    sessionId: string,
    params?: CancelSessionParams
  ) => {
    const result = await cancelApi.execute(`/api/sessions/${sessionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "CANCELLED",
        cancellationReason: params?.cancellationReason?.trim() || undefined,
      }),
    });

    if (result) {
      setSessions(prev =>
        prev.map(s =>
          s.id === sessionId
            ? {
                ...s,
                status: "CANCELLED",
                cancellationReason: params?.cancellationReason?.trim() || null,
                cancelledAt: new Date().toISOString(),
              }
            : s
        )
      );
    }
    return result;
  }, [cancelApi]);

  const approveSession = useCallback(async (sessionId: string) => {
    const result = await approveApi.execute(`/api/sessions/${sessionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SCHEDULED" }),
    });

    if (result) {
      setSessions(prev =>
        prev.map(s =>
          s.id === sessionId ? { ...s, status: "SCHEDULED" } : s
        )
      );
    }
    return result;
  }, [approveApi]);

  const updateSessionStatus = useCallback(async (
    sessionId: string,
    status: string,
    cancellationReason?: string
  ) => {
    const body: Record<string, unknown> = { status };
    if (status === "CANCELLED" && cancellationReason) {
      body.cancellationReason = cancellationReason.trim();
    }

    const result = await statusApi.execute(`/api/sessions/${sessionId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (result) {
      setSessions(prev =>
        prev.map(s =>
          s.id === sessionId
            ? {
                ...s,
                status,
                ...(status === "CANCELLED"
                  ? {
                      cancellationReason: cancellationReason?.trim() || null,
                      cancelledAt: new Date().toISOString(),
                    }
                  : {}),
              }
            : s
        )
      );
    }
    return result;
  }, [statusApi]);

  return {
    sessions,
    setSessions,
    fetchSessions,
    updateSession,
    cancelSession,
    approveSession,
    updateSessionStatus,
    isLoading: fetchApi.isLoading,
    isCancelling: cancelApi.isLoading,
    isUpdating: updateApi.isLoading || statusApi.isLoading,
    isApproving: approveApi.isLoading,
    error: fetchApi.error,
  };
}
