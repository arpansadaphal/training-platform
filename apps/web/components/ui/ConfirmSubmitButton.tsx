// apps/web/components/ui/ConfirmSubmitButton.tsx
//
// Phase A2: a submit button that asks before submitting its form. Used for
// actions a misclick should not trigger (archiving a Program). A native
// confirm() keeps it dependency-free and keyboard-accessible.

"use client";

import type { CSSProperties, ReactNode } from "react";

export function ConfirmSubmitButton({
  message,
  children,
  style,
  className,
}: {
  message: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <button
      type="submit"
      style={style}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
