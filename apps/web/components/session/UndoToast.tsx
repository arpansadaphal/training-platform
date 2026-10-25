// apps/web/components/session/UndoToast.tsx
//
// A message with one action ("Set deleted. Undo"), shown for a few seconds
// over the bottom of the screen. It replaces a confirm dialog: the action
// happens at once, and this is the way back. Announced politely to screen
// readers; the Undo button is a 44px target.

"use client";

import { useEffect } from "react";
import styles from "./UndoToast.module.css";

export interface ToastState {
  /** A new key restarts the timer, so two toasts in a row each get their time. */
  key: number;
  message: string;
  actionLabel: string;
  onAction: () => void;
}

/** Long enough to read and reach; the roadmap's audit found 2 s too short. */
const TOAST_MS = 6000;

export function UndoToast({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (toast === null) return;
    const id = window.setTimeout(onDismiss, TOAST_MS);
    return () => window.clearTimeout(id);
    // The key, not the callback, decides when the timer restarts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.key]);

  if (toast === null) return null;
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.message}>{toast.message}</span>
      <button
        type="button"
        className={styles.action}
        onClick={() => {
          toast.onAction();
          onDismiss();
        }}
      >
        {toast.actionLabel}
      </button>
    </div>
  );
}
