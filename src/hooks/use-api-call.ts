"use client";
import { useState, useCallback } from "react";
import { toast } from "sonner";

interface UseApiCallOptions {
  successMessage?: string;
  errorMessage?: string;
}

export function useApiCall<T = unknown>(options: UseApiCallOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (
    url: string,
    fetchOptions?: RequestInit
  ): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(url, fetchOptions);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "אירעה שגיאה");
      }
      if (options.successMessage) {
        toast.success(options.successMessage);
      }
      return data as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : "אירעה שגיאה";
      setError(message);
      toast.error(options.errorMessage || message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options.successMessage, options.errorMessage]);

  return { execute, isLoading, error };
}
