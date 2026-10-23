// apps/web/components/session/OptionSheet.tsx
//
// A phone-friendly picker: a 44px button that opens a bottom sheet (a native
// <dialog>, so focus, Escape and the backdrop come for free). The list scrolls
// and opens centered on a target, which is not selected: choosing is still the
// user's act.
//
// Phase A3c: used for the weight and the effort (RPE) while logging.

"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./OptionSheet.module.css";

export interface SheetOption {
  /** What is handed to onSelect; also the identity of the option. */
  value: string;
  node: ReactNode;
  /** Plain-text name for assistive tech and tests. */
  text: string;
}

interface Props {
  /** The field's caption and the sheet's title, e.g. "Weight (kg)". */
  label: string;
  /** The button's text when something is chosen; null shows the placeholder. */
  buttonText: string | null;
  placeholder: string;
  /** Currently chosen value ("" for none). */
  selected: string;
  /** The scrolling list. */
  options: readonly SheetOption[];
  /** Value the list centers on when opened; falls back to `selected`. */
  targetValue: string | null;
  /** Fixed above the list (e.g. "Same as last", "Bodyweight"). */
  pinned?: readonly SheetOption[];
  /** Fixed below the list (e.g. "Don't record"). */
  footer?: readonly SheetOption[];
  onSelect: (value: string) => void;
  /** Extra test/hook id on the trigger. */
  testId?: string;
}

export function OptionSheet({
  label,
  buttonText,
  placeholder,
  selected,
  options,
  targetValue,
  pinned = [],
  footer = [],
  onSelect,
  testId,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const centerOn = selected !== "" ? selected : targetValue;

  function openSheet() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function choose(value: string) {
    onSelect(value);
    dialogRef.current?.close();
  }

  // Center the target once the list is in the DOM.
  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const target = list?.querySelector<HTMLElement>('[data-center="true"]');
    if (list && target) {
      list.scrollTop = target.offsetTop - list.clientHeight / 2 + target.offsetHeight / 2;
    }
  }, [open]);

  // Move focus into the list's target so keyboards start in the right place.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[data-center="true"]')?.focus({ preventScroll: true });
  }, [open]);

  function onOptionKey(e: KeyboardEvent<HTMLElement>, value: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(value);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const sib = e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      if (sib instanceof HTMLElement) sib.focus();
    }
  }

  const fixed = (o: SheetOption) => (
    <button
      key={o.value}
      type="button"
      className={`${styles.fixedOption} ${o.value === selected ? styles.chosen : ""}`}
      onClick={() => choose(o.value)}
    >
      {o.node}
    </button>
  );

  return (
    <>
      <button
        type="button"
        className={`${styles.trigger} ${buttonText === null ? styles.placeholder : ""}`}
        aria-haspopup="dialog"
        aria-label={buttonText === null ? `${label}: not set` : `${label}: ${buttonText}`}
        data-testid={testId}
        onClick={openSheet}
      >
        {buttonText ?? placeholder}
      </button>

      <dialog
        ref={dialogRef}
        className={styles.sheet}
        aria-label={label}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        {open ? (
          <div className={styles.sheetBody}>
            <div className={styles.sheetHeader}>
              <h2 className={styles.sheetTitle}>{label}</h2>
              <button
                type="button"
                className={styles.closeButton}
                aria-label="Close"
                onClick={() => dialogRef.current?.close()}
              >
                ×
              </button>
            </div>
            {pinned.length > 0 ? <div className={styles.fixedGroup}>{pinned.map(fixed)}</div> : null}
            <div ref={listRef} className={styles.list} role="listbox" aria-label={label}>
              {options.map((o) => {
                const center = o.value === centerOn;
                return (
                  <div
                    key={o.value}
                    role="option"
                    aria-selected={o.value === selected}
                    aria-label={o.text}
                    tabIndex={center ? 0 : -1}
                    data-center={center ? "true" : undefined}
                    data-value={o.value}
                    className={`${styles.option} ${o.value === selected ? styles.chosen : ""} ${center ? styles.centered : ""}`}
                    onClick={() => choose(o.value)}
                    onKeyDown={(e) => onOptionKey(e, o.value)}
                  >
                    {o.node}
                  </div>
                );
              })}
            </div>
            {footer.length > 0 ? <div className={styles.fixedGroup}>{footer.map(fixed)}</div> : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
