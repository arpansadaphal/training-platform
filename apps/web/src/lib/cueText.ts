// How a cue is laid out on the session screen: its lines grouped under Setup / Action / Feel, and the drive verbs
// of an Action line picked out for bold so a lifter can find them in a glance between sets.

import type { CueKind, CueStep } from "@training/db";

export const CUE_LABEL: Record<CueKind, string> = {
  setup: "Setup",
  action: "Action",
  feel: "Feel",
};

export interface CueGroup {
  kind: CueKind;
  label: string;
  lines: string[];
}

/** Consecutive steps of one kind share a label, so a draft's two or three action lines sit under one "Action". */
export function groupCues(steps: readonly CueStep[]): CueGroup[] {
  const groups: CueGroup[] = [];
  for (const step of steps) {
    const last = groups[groups.length - 1];
    if (last && last.kind === step.kind) last.lines.push(step.text);
    else groups.push({ kind: step.kind, label: CUE_LABEL[step.kind], lines: [step.text] });
  }
  return groups;
}

/** The verbs set in bold in an Action line. A hyphenated word ("push-up", "pull-through") is a name, not a verb. */
const ACTION_VERB =
  /(?<![\w-])(lead with|drive|pin|press|pull|push|squeeze|brace|lock|plant|stack|meet|reach)(?![\w-])/gi;

export interface CueSegment {
  text: string;
  bold: boolean;
}

/** Splits a line into plain and bold runs. Only Action lines are passed through this; Setup and Feel stay plain. */
export function boldActionVerbs(text: string): CueSegment[] {
  const out: CueSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(ACTION_VERB)) {
    const at = m.index!;
    if (at > last) out.push({ text: text.slice(last, at), bold: false });
    out.push({ text: m[0], bold: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out.length > 0 ? out : [{ text, bold: false }];
}
