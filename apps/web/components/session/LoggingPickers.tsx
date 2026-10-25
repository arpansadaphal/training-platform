// apps/web/components/session/LoggingPickers.tsx
//
// The weight and effort pickers used while logging a set (Phase A3a.1). Both
// hand back the same plain numeric strings the old text inputs did; only the
// way they are chosen changed.

"use client";

import {
  RPE_OPTIONS,
  rpeLabel,
  rpeOptionText,
  weightOption,
  weightOptions,
  weightTarget,
} from "@training/domain";
import { OptionSheet, type SheetOption } from "./OptionSheet";
import styles from "./OptionSheet.module.css";

type Unit = "kg" | "lb";

function numberString(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export interface WeightPickerProps {
  /** Field caption, e.g. "Weight (kg)". */
  label: string;
  unit: Unit;
  /** "" = not set. */
  value: string;
  onChange: (value: string) => void;
  /** The plan's weight; where the list opens when there is no target. */
  plannedWeight: number | null;
  /**
   * ARCH-062: the weight to aim for (a next-session target, or a suggested
   * starting weight). The list opens centered on it and offers it as the top
   * row. It is never chosen for the lifter: choosing it is a tap.
   */
  targetWeight?: number | null;
  /** The target row's name: "Target" (default) or "Suggested". */
  targetLabel?: string;
  /** The weight last logged for this exercise, offered as "Same as last". */
  lastWeight: number | null;
  /** Unit text to put after a number ("kg", "kg per dumbbell"). */
  unitText: string;
  testId?: string;
}

export function WeightPicker({
  label,
  unit,
  value,
  onChange,
  plannedWeight,
  targetWeight = null,
  targetLabel = "Target",
  lastWeight,
  unitText,
  testId,
}: WeightPickerProps) {
  const current = value === "" ? null : Number(value);
  const extras = [plannedWeight, targetWeight, lastWeight, current].filter(
    (n): n is number => n !== null && Number.isFinite(n),
  );
  const all = weightOptions(unit, extras);
  const asOption = (o: ReturnType<typeof weightOption>): SheetOption => ({
    value: numberString(o.value),
    text: o.otherLabel ? `${o.label}, ${o.otherLabel}` : o.label,
    node:
      o.otherLabel === null ? (
        o.label
      ) : (
        <>
          <span>{o.label}</span>
          <span className={styles.other}>{o.otherLabel}</span>
        </>
      ),
  });

  const pinned: SheetOption[] = [];
  if (targetWeight !== null && targetWeight > 0) {
    const target = weightOption(targetWeight, unit);
    pinned.push({
      value: numberString(targetWeight),
      text: `${targetLabel}, ${target.label}`,
      node: (
        <>
          <span>{targetLabel}</span>
          <span className={styles.detail}>{target.label}</span>
        </>
      ),
    });
  }
  if (lastWeight !== null) {
    const last = weightOption(lastWeight, unit);
    pinned.push({
      value: numberString(lastWeight),
      text: `Same as last, ${last.label}`,
      node: (
        <>
          <span>Same as last</span>
          <span className={styles.detail}>{last.label}</span>
        </>
      ),
    });
  }
  pinned.push({ value: "0", text: "Bodyweight", node: "Bodyweight" });

  const list = all.filter((o) => o.value !== 0).map(asOption);

  const buttonText =
    current === null
      ? null
      : current === 0
        ? "Bodyweight"
        : `${numberString(current)} ${unitText}`;

  return (
    <OptionSheet
      label={label}
      buttonText={buttonText}
      placeholder="Choose"
      selected={current === null ? "" : numberString(current)}
      options={list}
      pinned={pinned}
      targetValue={numberString(weightTarget(unit, targetWeight ?? plannedWeight))}
      onSelect={onChange}
      testId={testId}
    />
  );
}

export interface RpePickerProps {
  label?: string;
  /** "" = not recorded. */
  value: string;
  onChange: (value: string) => void;
  /** A stored RPE that is not one of the five options (e.g. 7) stays choosable. */
  testId?: string;
}

export function RpePicker({ label = "RPE", value, onChange, testId }: RpePickerProps) {
  const current = value === "" ? null : Number(value);
  const list: SheetOption[] = RPE_OPTIONS.map((o) => ({
    value: String(o.rpe),
    text: `${rpeOptionText(o)}, RPE ${o.rpe}`,
    node: (
      <>
        <span>{rpeOptionText(o)}</span>
        <span className={styles.detail}>RPE {o.rpe}</span>
      </>
    ),
  }));
  if (current !== null && !RPE_OPTIONS.some((o) => o.rpe === current)) {
    list.push({ value: numberString(current), text: `RPE ${numberString(current)}`, node: `RPE ${numberString(current)}` });
    list.sort((a, b) => Number(a.value) - Number(b.value));
  }
  const footer: SheetOption[] = [{ value: "", text: "Don't record", node: "Don't record" }];

  return (
    <OptionSheet
      label={label}
      buttonText={current === null ? null : rpeLabel(current)}
      placeholder="Choose"
      selected={current === null ? "" : numberString(current)}
      options={list}
      footer={footer}
      targetValue={current === null ? "8" : numberString(current)}
      onSelect={onChange}
      testId={testId}
    />
  );
}
