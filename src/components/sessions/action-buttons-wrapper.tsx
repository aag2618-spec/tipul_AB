"use client";

import { ReactNode } from "react";

interface ActionButtonsWrapperProps {
  children: ReactNode;
}

export function ActionButtonsWrapper({ children }: ActionButtonsWrapperProps) {
  return (
    <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {children}
    </div>
  );
}
