"use client";

import { useRouter } from "next/navigation";

interface ClientNameLinkProps {
  clientId: string;
  clientName: string;
}

export function ClientNameLink({ clientId, clientName }: ClientNameLinkProps) {
  const router = useRouter();

  return (
    <span 
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/dashboard/clients/${clientId}`);
      }}
      className="font-medium hover:text-primary hover:underline transition-colors text-base cursor-pointer"
    >
      {clientName}
    </span>
  );
}
