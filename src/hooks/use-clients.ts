"use client";
import { useState, useCallback } from "react";
import { useApiCall } from "./use-api-call";

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  isQuickClient?: boolean;
  defaultSessionPrice: number | null;
  createdAt: string;
  _count?: {
    therapySessions: number;
  };
}

interface ClientDetail extends Client {
  birthDate: string | null;
  address: string | null;
  notes: string | null;
  initialDiagnosis: string | null;
  intakeNotes: string | null;
  therapySessions?: unknown[];
  payments?: unknown[];
  recordings?: unknown[];
  documents?: unknown[];
}

interface CreateClientParams {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  address?: string;
  notes?: string;
  status?: string;
  defaultSessionPrice?: number;
}

interface UpdateClientParams {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  birthDate?: string;
  address?: string;
  notes?: string;
  status?: string;
  defaultSessionPrice?: number | null;
  initialDiagnosis?: string;
  intakeNotes?: string;
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);

  const fetchApi = useApiCall<Client[]>();
  const createApi = useApiCall<ClientDetail>({
    successMessage: "המטופל נוצר בהצלחה",
  });
  const updateApi = useApiCall<ClientDetail>({
    successMessage: "המטופל עודכן בהצלחה",
  });
  const deleteApi = useApiCall<{ message: string }>({
    successMessage: "המטופל נמחק בהצלחה",
  });

  const fetchClients = useCallback(async (status?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const query = params.toString();
    const url = `/api/clients${query ? `?${query}` : ""}`;

    const data = await fetchApi.execute(url);
    if (data) {
      setClients(data);
    }
    return data;
  }, [fetchApi]);

  const createClient = useCallback(async (params: CreateClientParams) => {
    const result = await createApi.execute("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (result) {
      setClients(prev => [...prev, {
        id: result.id,
        firstName: result.firstName,
        lastName: result.lastName,
        name: result.name,
        phone: result.phone,
        email: result.email,
        status: result.status,
        isQuickClient: result.isQuickClient,
        defaultSessionPrice: result.defaultSessionPrice,
        createdAt: result.createdAt,
      }]);
    }
    return result;
  }, [createApi]);

  const updateClient = useCallback(async (
    clientId: string,
    params: UpdateClientParams
  ) => {
    const result = await updateApi.execute(`/api/clients/${clientId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (result) {
      setClients(prev =>
        prev.map(c =>
          c.id === clientId
            ? {
                ...c,
                firstName: result.firstName,
                lastName: result.lastName,
                name: result.name,
                phone: result.phone,
                email: result.email,
                status: result.status,
                defaultSessionPrice: result.defaultSessionPrice,
                createdAt: result.createdAt,
              }
            : c
        )
      );
    }
    return result;
  }, [updateApi]);

  const deleteClient = useCallback(async (clientId: string) => {
    const result = await deleteApi.execute(`/api/clients/${clientId}`, {
      method: "DELETE",
    });

    if (result) {
      setClients(prev => prev.filter(c => c.id !== clientId));
    }
    return result;
  }, [deleteApi]);

  return {
    clients,
    setClients,
    fetchClients,
    createClient,
    updateClient,
    deleteClient,
    isLoading: fetchApi.isLoading,
    isCreating: createApi.isLoading,
    isUpdating: updateApi.isLoading,
    isDeleting: deleteApi.isLoading,
    error: fetchApi.error,
  };
}
