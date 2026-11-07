// packages/domain/src/check/hint.ts
//
// The one line under the disabled "Check my program" button (the only gate: there is no separate "Looks right"). It used to say "Add 3 more recognized exercises"
// whenever fewer than 3 lines were resolved, including when 25 lines had been pasted and none was understood.
// Now: "Add N more" only when 1 or 2 exercises are recognized; zero says so and points at the format.

import { CHECK_COPY } from "./copy";

export interface HintInput {
  readonly minExercises: number;
  /** Exercises that are recognised and analysable (accepted or answered). */
  readonly resolved: number;
  /** Lines read as sets-by-reps whose exercise still needs an answer. */
  readonly unresolved: number;
  /** Lines that looked like exercises but had no readable sets and reps. */
  readonly unparsed: number;
}

export function checkHint(input: HintInput): string | null {
  const { minExercises, resolved, unresolved, unparsed } = input;
  if (resolved < minExercises) {
    if (unresolved > 0) return CHECK_COPY.resolveFirst(unresolved);
    if (resolved === 0) return CHECK_COPY.noneRecognized(unparsed);
    return CHECK_COPY.needMoreExercises(minExercises - resolved);
  }
  // One gate. Nothing is left to say once every question is answered: the button is enabled.
  return unresolved > 0 ? CHECK_COPY.resolveFirst(unresolved) : null;
}
