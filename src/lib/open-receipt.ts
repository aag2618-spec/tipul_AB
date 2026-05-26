import { toast } from "sonner";

export function openReceiptInNewTab(receiptUrl: string | null | undefined): void {
  if (!receiptUrl) return;
  const win = window.open(receiptUrl, "_blank", "noopener,noreferrer");
  if (!win) {
    toast.info("הקבלה מוכנה", {
      action: {
        label: "פתח קבלה",
        onClick: () => window.open(receiptUrl, "_blank", "noopener,noreferrer"),
      },
      duration: 10000,
    });
  }
}
