"use client";

import Image from "next/image";
import { APP_LOGO } from "@/config/branding";
import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  priority?: boolean;
  /** Override intrinsic width (keep proportional with height when both set). */
  width?: number;
  height?: number;
};

export function AppLogo({ className, priority, width, height }: AppLogoProps) {
  return (
    <Image
      src={APP_LOGO.src}
      alt={APP_LOGO.alt}
      width={width ?? APP_LOGO.width}
      height={height ?? APP_LOGO.height}
      className={cn(className)}
      priority={priority}
    />
  );
}
