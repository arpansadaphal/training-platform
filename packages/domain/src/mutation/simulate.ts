// packages/domain/src/mutation/simulate.ts
//
// simulate — the pure composition that applies a MutationSpec to a base
// ProgramStructure and reports what the deterministic engine says about the
// change, without persisting anything.
//
// PURE: no I/O, no Prisma, no HTTP, no session. Same inputs → same outputs
// modulo the injected clock (only used for the Analysis's computedAt).
//
// The whole reason this file exists is invariant 2: simulate and commit must
// be the SAME mutation function. This file calls `applyMutation` — the one
// from apply-mutation.ts — never a wrapper. The commit path
// (packages/api/src/services/programVersionService.ts) calls the same
// function. If you find yourself adding a "simulation-only" mutation helper
// here, stop; that is the failure invariant 2 forbids.
//
// The CANNOT_COMPUTE branch is not a degraded path — it is the honest one.
// The shipped HYPERTROPHY_CONFIG has all-null thresholds (ARCH-029/031), so
// both base and mutated assessments come back UNVALIDATED, and Gain/Cost/Net
// genuinely cannot be computed. Returning a fabricated COMPUTED result would
// be the same class of bug as fabricating a band for an unvalidated axis.
//
// CANNOT_COMPUTE carries both analyses as well as both assessments (see the
// extension note in types.ts and ARCH-036 addendum): the persisted Simulation
// row's Json columns are non-null, and this is the only way to persist the
// full picture without a second engine pass.

import { computeAnalysis } from "../analysis/computeAnalysis";
import type {
  ExerciseReferenceData,
  GoalProfileConfig,
} from "../analysis/types";
import { computeAssessment } from "../assessment/computeAssessment";
import type { ProgramStructure } from "../types";
import { applyMutation } from "./apply-mutation";
import { diffAssessments } from "./diff-assessments";
import {
  MutationError,
  type MutationSpec,
  type SimulationResult,
} from "./types";

/**
 * Options for `simulate`.
 *
 *   - goalId  — required. The Goal row the assessment is computed against
 *               (invariant 4: Goal is a query-time parameter, never baked
 *               into the ProgramVersion). The caller resolves it — the
 *               domain layer does not look up a registry or a database.
 *
 *   - now     — optional clock injection, matching computeAnalysis's own
 *               `options.now`. Used so a test can pin both the base and
 *               mutated `computedAt` to a fixed instant, and so the
 *               full-stack invariant test (Phase 5c) can run simulate and
 *               commit against a shared timestamp without either side
 *               leaking the wall clock into the assertion.
 */
export interface SimulateOptions {
  goalId: string;
  now?: () => Date;
}

/**
 * Apply `mutation` to `baseStructure`, compute the deterministic engine on
 * both sides, and return the diff.
 *
 * Returns a discriminated union:
 *
 *   - INVALID_MUTATION — if applyMutation threw a MutationError. Note this
 *                        is caught and returned, never re-thrown — the AI
 *                        Coach's tool handler (Phase 8) needs an invalid
 *                        mutation to be a first-class result it can narrate,
 *                        not an exception that crashes the conversation
 *                        (07-versioning-and-simulation.md, §"must never
 *                        crash the conversation").
 *
 *   - CANNOT_COMPUTE   — if either assessment is UNVALIDATED. Both
 *                        assessments and both analyses are carried so the
 *                        honest-state UI can show the reason without
 *                        re-running the engine.
 *
 *   - COMPUTED         — the full result: base/mutated analysis and
 *                        assessment, the mutated structure, and Gain/Cost/
 *                        Net + What-Changed.
 *
 * A non-MutationError thrown by applyMutation propagates — that would
 * indicate an internal invariant violation (e.g. the "Unreachable" branches
 * in apply-mutation.ts), and swallowing it would hide a bug.
 */
export function simulate(
  baseStructure: ProgramStructure,
  mutation: MutationSpec,
  config: GoalProfileConfig,
  referenceData: ExerciseReferenceData,
  options: SimulateOptions,
): SimulationResult {
  // ── Apply the mutation (the shared function) ──────────────────────────────
  let mutatedStructure: ProgramStructure;
  try {
    mutatedStructure = applyMutation(baseStructure, mutation);
  } catch (err) {
    if (err instanceof MutationError) {
      return { kind: "INVALID_MUTATION", error: err };
    }
    throw err;
  }

  const now = options.now ?? (() => new Date());
  const goalId = options.goalId;

  // Both analyses use the same `now` — this is deliberate, not a shortcut.
  // The engine's only wall-clock read is `computedAt`; pinning both sides to
  // the same instant makes the two Analysis payloads comparable as values
  // rather than as timestamped observations, which is what the diff and the
  // full-stack invariant test both want.
  const baseAnalysis = computeAnalysis(baseStructure, referenceData, config, {
    now,
  });
  const baseAssessment = computeAssessment(baseAnalysis, config, { goalId });

  const mutatedAnalysis = computeAnalysis(
    mutatedStructure,
    referenceData,
    config,
    { now },
  );
  const mutatedAssessment = computeAssessment(mutatedAnalysis, config, {
    goalId,
  });

  // ── CANNOT_COMPUTE: at least one side is unvalidated ──────────────────────
  //
  // The shipped HYPERTROPHY_CONFIG hits this branch — both sides are
  // UNVALIDATED because every axis weight is null. The caller renders the
  // honest "cannot compute" state; it does not see a fabricated diff.
  //
  // Both analyses and both assessments are carried. This is what makes the
  // persisted Simulation row's non-null Json columns satisfiable without a
  // second engine pass (ARCH-036 addendum).
  if (
    baseAssessment.kind === "UNVALIDATED" ||
    mutatedAssessment.kind === "UNVALIDATED"
  ) {
    return {
      kind: "CANNOT_COMPUTE",
      reason: "ASSESSMENT_UNVALIDATED",
      baseAnalysis,
      baseAssessment,
      mutatedAnalysis,
      mutatedAssessment,
    };
  }

  // ── COMPUTED ──────────────────────────────────────────────────────────────
  //
  // diffAssessments re-asserts the VALIDATED precondition (defense in depth
  // — the branch above already guarantees it), so an unconditional call is
  // safe here.
  const { gain, cost, net, whatChanged } = diffAssessments(
    baseAssessment,
    mutatedAssessment,
  );

  return {
    kind: "COMPUTED",
    baseAnalysis,
    baseAssessment,
    mutatedStructure,
    mutatedAnalysis,
    mutatedAssessment,
    gain,
    cost,
    net,
    whatChanged,
  };
}