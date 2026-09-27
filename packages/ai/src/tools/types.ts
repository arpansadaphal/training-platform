/**
 * Tool-layer types.
 *
 * The tool layer is the boundary between the model (which requests tool
 * calls) and the server (which executes them). Everything the tools need from
 * the outside world arrives through `CoachToolDeps`, which is injected by
 * packages/api at construction time. This module has NO import from
 * the API package — the boundary test enforces this.
 *
 * Execution model:
 *   1. Orchestrator assembles ToolExecutionContext from the authenticated
 *      session + the loaded conversation.
 *   2. Model emits a tool_use with a name and raw input.
 *   3. Orchestrator calls ToolRegistry.execute(name, rawInput, ctx).
 *   4. The matching CoachTool validates rawInput, calls deps, returns
 *      { modelContent, segments? }.
 *   5. Orchestrator feeds modelContent back to the model as a tool_result,
 *      and appends any segments to the final AIMessage.
 *
 * `userId`, `conversationId`, `currentProgramId`, and `currentProgramVersionId`
 * are NEVER supplied by the model. They are always injected from the server
 * session. A tool that needs them reads them off `ctx`, never off the model's
 * input — this is the mechanism behind the permission-boundary test in
 * 13-testing-strategy.md.
 */

import type { MutationSpec, SimulationResult } from '@training/domain';

import type { AIMessageSegment, ConstraintKind } from '../types';

// ---------------------------------------------------------------------------
// Projections returned by injected deps
//
// These are the shapes packages/ai is willing to consume. packages/api's
// implementations project their richer domain rows down to these — that keeps
// packages/ai from depending on the DB row shapes and keeps the dependency
// surface small.
// ---------------------------------------------------------------------------

export interface ExerciseLookupResult {
  id: string;
  name: string;
  muscleGroups: string[];
}

export interface SimulationSummary {
  id: string;
  baseVersionId: string;
  /**
   * Server-rendered human description of the mutation.
   *
   * SAFETY: this string is built by the server from persisted Simulation data,
   * never from model output. It is the label that appears on the user-facing
   * "Apply this change" button, so a model cannot inject arbitrary text into a
   * confirmation control by influencing this field (Phase 8 ruling, Q6).
   *
   * The `loadOwnedSimulation` dep is what populates this. Its implementation
   * lives in packages/api and is the only place this value is constructed.
   */
  humanSummary: string;
}

export interface ConstraintRecord {
  id: string;
  kind: ConstraintKind;
  note: string;
  createdAtISO: string;
}

export interface TemporaryConstraintRecord {
  id: string;
  conversationId: string;
  note: string;
  createdAtISO: string;
}

export interface TrainingHistorySummary {
  blocks: Array<{
    id: string;
    programVersionId: string;
    startedAtISO: string;
    endedAtISO: string | null;
    sessionsCompleted: number;
    observationCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// Injected dependencies
// ---------------------------------------------------------------------------

export interface SimulateAndPersistInput {
  /** From ctx — never from the model. */
  userId: string;
  /** From ctx — never from the model. */
  programId: string;
  /** From ctx — the version the Coach is looking at. */
  baseVersionId: string;
  /**
   * From ctx — the conversation this turn belongs to. Written to the
   * Simulation row's createdByConversationId column as a provenance marker,
   * so a Coach-originated simulation is distinguishable from a UI-originated
   * one.
   */
  conversationId: string;
  spec: MutationSpec;
}

export interface SimulateAndPersistResult {
  /**
   * null when the mutation was invalid and no Simulation row was written
   * (INVALID_MUTATION branch). Non-null for COMPUTED and CANNOT_COMPUTE.
   */
  simulationId: string | null;
  result: SimulationResult;
}

export interface CoachToolDeps {
  /** Read-only reference-data query. */
  lookupExercises(input: {
    userId: string;
    query?: string;
  }): Promise<ExerciseLookupResult[]>;

  /**
   * The single call that persists a Simulation row. packages/api wires this
   * to the SAME service function simulation.simulate uses — the injection
   * exists so packages/ai can call it without importing the API package
   * (see Phase 8 Q1 ruling).
   */
  simulateAndPersist(
    input: SimulateAndPersistInput,
  ): Promise<SimulateAndPersistResult>;

  /**
   * Ownership-checked load of a persisted Simulation. Returns null when the
   * simulation does not exist OR does not belong to userId — the caller must
   * not distinguish the two cases to the model.
   */
  loadOwnedSimulation(input: {
    userId: string;
    simulationId: string;
  }): Promise<SimulationSummary | null>;

  noteConstraint(input: {
    userId: string;
    kind: ConstraintKind;
    note: string;
  }): Promise<ConstraintRecord>;

  noteTemporaryConstraint(input: {
    userId: string;
    conversationId: string;
    note: string;
  }): Promise<TemporaryConstraintRecord>;

  queryTrainingHistory(input: {
    userId: string;
    programId?: string;
    sinceISO?: string;
    limit?: number;
  }): Promise<TrainingHistorySummary>;
}

// ---------------------------------------------------------------------------
// Execution context and results
// ---------------------------------------------------------------------------

export interface ToolExecutionContext {
  /** From the authenticated session — never from the model. */
  userId: string;
  /** The conversation this turn belongs to. */
  conversationId: string;
  /** The program in view, if the conversation is scoped to one. */
  currentProgramId: string | null;
  /** The active ProgramVersion in view, if scoped. */
  currentProgramVersionId: string | null;
}

export interface ToolExecutionResult {
  /**
   * Serialised and sent back to the model as the tool_result content.
   * Must be JSON-serialisable.
   */
  modelContent: unknown;
  /**
   * Segments the orchestrator appends to the final AIMessage. Used by
   * prepare_apply_confirmation (to render an apply button) and by the
   * note_* tools (so the write is visible).
   */
  segments?: AIMessageSegment[];
}

export type ToolErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'UPSTREAM_FAILURE';

export class ToolExecutionError extends Error {
  readonly code: ToolErrorCode;
  constructor(message: string, code: ToolErrorCode) {
    super(message);
    this.name = 'ToolExecutionError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Tool shape
// ---------------------------------------------------------------------------

export interface CoachTool {
  /** Model-facing name. Snake_case by Anthropic convention. */
  name: string;
  /** Model-facing description. */
  description: string;
  /** JSON Schema for the model-facing input. */
  inputSchema: Record<string, unknown>;
  /**
   * Validate and execute. Throws ToolExecutionError on failure; the
   * orchestrator catches and surfaces that as an is_error tool_result,
   * never as a thrown exception out of the subscription.
   */
  execute(
    input: unknown,
    ctx: ToolExecutionContext,
  ): Promise<ToolExecutionResult>;
}