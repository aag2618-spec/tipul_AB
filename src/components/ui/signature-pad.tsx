"use client";

import { useRef, useState, ComponentType } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eraser, Check } from "lucide-react";
import type ReactSignatureCanvas from "react-signature-canvas";

// Dynamic import to avoid SSR issues
const SignatureCanvas = dynamic(
  () => import("react-signature-canvas"),
  { ssr: false }
) as ComponentType<any>;

interface SignaturePadProps {
  onSave: (signature: string) => void;
  onCancel?: () => void;
}

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const sigCanvas = useRef<ReactSignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const handleClear = () => {
    sigCanvas.current?.clear();
    setIsEmpty(true);
  };

  const handleSave = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      const dataURL = sigCanvas.current.toDataURL();
      onSave(dataURL);
    }
  };

  const handleEnd = () => {
    setIsEmpty(sigCanvas.current?.isEmpty() ?? true);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg bg-white">
          <SignatureCanvas
            ref={sigCanvas as any}
            canvasProps={{
              className: "w-full h-48 cursor-crosshair",
            }}
            onEnd={handleEnd}
          />
        </div>
        <p className="text-sm text-muted-foreground text-center mt-2">
          חתום כאן באמצעות העכבר או המגע
        </p>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            ביטול
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleClear}
          disabled={isEmpty}
          className="gap-2"
        >
          <Eraser className="h-4 w-4" />
          נקה
        </Button>
        <Button
          onClick={handleSave}
          disabled={isEmpty}
          className="gap-2"
        >
          <Check className="h-4 w-4" />
          אשר חתימה
        </Button>
      </div>
    </div>
  );
}
