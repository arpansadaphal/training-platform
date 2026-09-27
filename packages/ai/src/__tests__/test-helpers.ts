import type {
  Analysis,
  AssessmentResult,
  FitScoreResult,
  ProgramStructure,
  SimulationResult,
} from '@training/domain';

import type {
  AIMessageSegment,
  CoachStreamChunk,
  CoachToolDeps,
  ContextBuilderDeps,
  ModelProvider,
  OrchestratorDeps,
  PersistMessageInput,
  ScopedProgramVersion,
} from '..';

/**
 * Shared stubs for the packages/ai test suite.
 *
 * Not a *.test.ts file — vitest will not pick it up. It exists so each test
 * can construct an OrchestratorDeps without re-deriving the six tool stubs
 * and five context-builder stubs every time.
 *
 * Nothing here touches the network. The MockProvider (from ..) is what
 * scripts the model; these helpers script everything else.
 */

// Opaque stub result. Tests that care about the shape cast it; tests that
// only check pass-through use identity equality on the same reference.
const STUB_SIMULATION_RESULT = {
  kind: 'INVALID_MUTATION',
  reason: 'test stub',
} as unknown as SimulationResult;

export function makeStubScopedProgramVersion(): ScopedProgramVersion {
  return {
    programId: 'p-1',
    programVersionId: 'v-1',
    versionNumber: 1,
    structure: { workoutDays: [] } as unknown as ProgramStructure,
    analysis: {} as unknown as Analysis,
    assessment: {} as unknown as AssessmentResult,
    fitScore: {} as unknown as FitScoreResult,
    goalId: 'g-1',
    goalProfileKey: 'HYPERTROPHY',
  };
}

export interface ToolCallRecord {
  method: keyof CoachToolDeps;
  input: unknown;
}

/**
 * Tool deps with every method instrumented. Returns the deps object and the
 * calls array separately.
 *
 * Overrides are WRAPPED, not substituted: every call — including one to an
 * overridden method — is recorded on `calls`. This matters for tests that
 * override `loadOwnedSimulation` to return a fixture and then assert that
 * `loadOwnedSimulation` was the only dep touched; the earlier version
 * replaced the instrumented impl outright, which silently hid the call.
 */
export function makeSpyToolDeps(overrides?: Partial<CoachToolDeps>): {
  deps: CoachToolDeps;
  calls: ToolCallRecord[];
} {
  const calls: ToolCallRecord[] = [];

  const impl: CoachToolDeps = {
    lookupExercises: overrides?.lookupExercises ?? (async () => []),
    simulateAndPersist:
      overrides?.simulateAndPersist ??
      (async () => ({
        simulationId: 'sim-1',
        result: STUB_SIMULATION_RESULT,
      })),
    loadOwnedSimulation: overrides?.loadOwnedSimulation ?? (async () => null),
    noteConstraint:
      overrides?.noteConstraint ??
      (async () => ({
        id: 'c-1',
        kind: 'FREEFORM' as const,
        note: 'x',
        createdAtISO: '',
      })),
    noteTemporaryConstraint:
      overrides?.noteTemporaryConstraint ??
      (async () => ({
        id: 'tc-1',
        conversationId: 'conv-1',
        note: 'x',
        createdAtISO: '',
      })),
    queryTrainingHistory:
      overrides?.queryTrainingHistory ?? (async () => ({ blocks: [] })),
  };

  const deps: CoachToolDeps = {
    lookupExercises: async (input) => {
      calls.push({ method: 'lookupExercises', input });
      return impl.lookupExercises(input);
    },
    simulateAndPersist: async (input) => {
      calls.push({ method: 'simulateAndPersist', input });
      return impl.simulateAndPersist(input);
    },
    loadOwnedSimulation: async (input) => {
      calls.push({ method: 'loadOwnedSimulation', input });
      return impl.loadOwnedSimulation(input);
    },
    noteConstraint: async (input) => {
      calls.push({ method: 'noteConstraint', input });
      return impl.noteConstraint(input);
    },
    noteTemporaryConstraint: async (input) => {
      calls.push({ method: 'noteTemporaryConstraint', input });
      return impl.noteTemporaryConstraint(input);
    },
    queryTrainingHistory: async (input) => {
      calls.push({ method: 'queryTrainingHistory', input });
      return impl.queryTrainingHistory(input);
    },
  };

  return { deps, calls };
}

export function makeStubContextDeps(
  overrides?: Partial<ContextBuilderDeps>,
): ContextBuilderDeps {
  return {
    loadScopedProgramVersion: async () => null,
    listPersistentConstraints: async () => [],
    listTemporaryConstraintsForConversation: async () => [],
    listRecentConversationMessages: async () => [],
    loadTrainingHistorySummary: async () => null,
    ...overrides,
  };
}

export interface PersistSpy {
  calls: PersistMessageInput[];
}

export function makeStubOrchestratorDeps(
  provider: ModelProvider,
  overrides?: {
    toolDeps?: CoachToolDeps;
    contextDeps?: ContextBuilderDeps;
    persistSpy?: PersistSpy;
  },
): { deps: OrchestratorDeps; persistSpy: PersistSpy } {
  const persistSpy: PersistSpy = overrides?.persistSpy ?? { calls: [] };
  let id = 0;

  const deps: OrchestratorDeps = {
    provider,
    toolDeps: overrides?.toolDeps ?? makeSpyToolDeps().deps,
    contextDeps: overrides?.contextDeps ?? makeStubContextDeps(),
    persistMessage: async (input) => {
      persistSpy.calls.push(input);
      id += 1;
      return { messageId: `msg-${id}` };
    },
    l2Enabled: false,
    model: 'mock-model',
  };

  return { deps, persistSpy };
}

/**
 * Drain a CoachStreamChunk generator into an array. The subscription
 * handlers in the UI do the same thing with an onData callback; the tests
 * prefer the whole sequence up front so assertions can find chunks by type.
 */
export async function drain(
  gen: AsyncGenerator<CoachStreamChunk>,
): Promise<CoachStreamChunk[]> {
  const out: CoachStreamChunk[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

export const TURN_INPUT = {
  userId: 'user-1',
  conversationId: 'conv-1',
  userMessageText: 'hi',
};

/**
 * Serialize a set of model-emitted segments as the final-turn JSON the
 * system prompt instructs the model to produce. Only text/claim segments are
 * valid here — modelOutputSchema rejects everything else.
 */
export function finalTurnJson(segments: AIMessageSegment[]): string {
  return JSON.stringify({ segments });
}