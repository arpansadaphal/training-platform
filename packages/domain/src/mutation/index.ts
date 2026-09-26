// packages/domain/src/mutation/index.ts
//
// Public surface of the mutation package. Phase 4 shipped the shared
// applyMutation / MutationSpec. Phase 5 adds the pure simulation composition
// (simulate) and the two diff functions (diffAssessments / diffStructures),
// plus the types those functions are expressed in.

// ── Phase 4 — the shared mutation function ──────────────────────────────────

export { applyMutation } from "./apply-mutation";
export { MutationError } from "./types";
export type {
  MutationSpec,
  MutationOp,
  MutationErrorCode,
} from "./types";

// ── Phase 5 — simulation ────────────────────────────────────────────────────

export { simulate } from "./simulate";
export type { SimulateOptions } from "./simulate";

export { diffAssessments } from "./diff-assessments";
export type { AssessmentDiff } from "./diff-assessments";

export { diffStructures } from "./diff-structures";

export type {
  SimulationNet,
  SimulationResult,
  StructureDiffEntry,
  WhatChangedResult,
} from "./types";