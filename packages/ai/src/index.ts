/**
 * Public surface of packages/ai.
 *
 * Deliberately re-exports everything a caller (packages/api's coach router,
 * tests) needs and nothing more. Consumers should import from '@training/ai'
 * rather than reaching into submodules.
 *
 * BOUNDARY: nothing exported here reaches into the API package. The boundary
 * test at ./__tests__/boundary.test.ts enforces this.
 */

/**
 * Package version marker. A placeholder test (src/index.test.ts) asserts
 * this is exported; the value tracks packages/ai/package.json's version.
 * Kept as a literal rather than a JSON import so the package has no runtime
 * dependency on its own package.json.
 */
export const AI_PACKAGE_VERSION = '0.0.0';

// --- Coach response and stream types ---------------------------------------
export type {
  AIMessageRole,
  AIMessageSegment,
  ApplyConfirmationPayload,
  CoachStreamChunk,
  ConstraintKind,
  ConstraintNoticePayload,
  EvidenceTag,
  SegmentSourceRef,
  TemporaryConstraintNoticePayload,
} from './types';
export { isWellFormedSegment } from './types';

// --- Orchestrator -----------------------------------------------------------
export { runCoachTurn } from './orchestrator';
export type {
  CoachTurnInput,
  OrchestratorDeps,
  PersistMessageInput,
} from './orchestrator';

// --- Context builder --------------------------------------------------------
export { buildCoachContext, CONTEXT_BOUNDS } from './context-builder';
export type {
  AIMessageForContext,
  BuildCoachContextOptions,
  CoachContext,
  ContextBuilderDeps,
  ScopedProgramVersion,
} from './context-builder';

// --- Tools ------------------------------------------------------------------
export {
  buildAllTools,
  buildModelFacingTools,
  buildToolExecutor,
  toModelToolDefinitions,
  ToolExecutionError,
} from './tools';
export type {
  CoachTool,
  CoachToolDeps,
  ConstraintRecord,
  ExerciseLookupResult,
  SimulateAndPersistInput,
  SimulateAndPersistResult,
  SimulationSummary,
  TemporaryConstraintRecord,
  ToolExecutionContext,
  ToolExecutionResult,
  TrainingHistorySummary,
} from './tools';

// --- Provider ---------------------------------------------------------------
export { AnthropicProvider, MockProvider } from './provider';
export type { AnthropicProviderConfig } from './provider';
export type {
  ModelContentBlock,
  ModelMessage,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelStreamEvent,
  ScriptedTurn,
  ToolCall,
  ToolDefinition,
} from './provider';

// --- Structured output schema ----------------------------------------------
export {
  aiMessageSegmentSchema,
  MODEL_OUTPUT_SCHEMA_JSON,
  modelOutputSchema,
  parseModelOutput,
} from './schema';

// --- Grounding --------------------------------------------------------------
export {
  buildAllowedNumbers,
  checkGrounding,
  dropOffendingAndAddWarning,
  extractNumericTokens,
} from './grounding';
export type {
  GroundingInput,
  GroundingResult,
  OffendingToken,
} from './grounding';

// --- System prompt ----------------------------------------------------------
export { buildSystemPrompt } from './system-prompt';