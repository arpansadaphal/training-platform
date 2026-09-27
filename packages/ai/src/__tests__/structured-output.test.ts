import { describe, expect, it } from 'vitest';

import {
  MockProvider,
  aiMessageSegmentSchema,
  modelOutputSchema,
  parseModelOutput,
  runCoachTurn,
} from '..';

import {
  drain,
  finalTurnJson,
  makeStubOrchestratorDeps,
  TURN_INPUT,
} from './test-helpers';

// ---------------------------------------------------------------------------
// parseModelOutput — the tolerant JSON extractor
// ---------------------------------------------------------------------------

describe('parseModelOutput', () => {
  it('parses a plain JSON object', () => {
    expect(parseModelOutput('{"segments":[]}')).toEqual({ segments: [] });
  });

  it('parses a fenced JSON block', () => {
    expect(parseModelOutput('```json\n{"segments":[]}\n```')).toEqual({
      segments: [],
    });
  });

  it('parses JSON surrounded by prose by slicing the outermost object', () => {
    expect(
      parseModelOutput('Here you go: {"segments":[]} — hope that helps'),
    ).toEqual({ segments: [] });
  });

  it('throws on empty text', () => {
    expect(() => parseModelOutput('')).toThrow();
  });

  it('throws when no JSON object is present', () => {
    expect(() => parseModelOutput('not json at all')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// modelOutputSchema — what the model is allowed to emit
// ---------------------------------------------------------------------------

describe('modelOutputSchema', () => {
  it('accepts a text segment', () => {
    const result = modelOutputSchema.safeParse({
      segments: [{ type: 'text', content: 'hi' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a claim segment with a tag', () => {
    const result = modelOutputSchema.safeParse({
      segments: [{ type: 'claim', tag: 'PLANNED', content: 'three sets' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a claim segment without a tag', () => {
    const result = modelOutputSchema.safeParse({
      segments: [{ type: 'claim', content: 'three sets' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a claim with an unrecognized tag value', () => {
    const result = modelOutputSchema.safeParse({
      segments: [{ type: 'claim', tag: 'MAYBE', content: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown segment type', () => {
    const result = modelOutputSchema.safeParse({
      segments: [{ type: 'speculation', content: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty segments array', () => {
    expect(modelOutputSchema.safeParse({ segments: [] }).success).toBe(false);
  });

  it('rejects a server-only segment type (apply_confirmation)', () => {
    // The model must never emit an apply_confirmation — that is a
    // server-built segment from the prepare tool result. The schema is the
    // mechanical enforcement of the separation.
    const result = modelOutputSchema.safeParse({
      segments: [
        {
          type: 'apply_confirmation',
          content: 'x',
          payload: { simulationId: 'sim-1', summary: 'y' },
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a claim with an empty content string', () => {
    const result = modelOutputSchema.safeParse({
      segments: [{ type: 'claim', tag: 'PLANNED', content: '' }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// aiMessageSegmentSchema — the full persisted union
// ---------------------------------------------------------------------------

describe('aiMessageSegmentSchema (full union)', () => {
  it('accepts an apply_confirmation segment with a valid payload', () => {
    const result = aiMessageSegmentSchema.safeParse({
      type: 'apply_confirmation',
      content: 'x',
      payload: { simulationId: 'sim-1', summary: 'y' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an apply_confirmation segment missing simulationId', () => {
    const result = aiMessageSegmentSchema.safeParse({
      type: 'apply_confirmation',
      content: 'x',
      payload: { summary: 'y' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a constraint_notice with a valid kind', () => {
    const result = aiMessageSegmentSchema.safeParse({
      type: 'constraint_notice',
      content: 'x',
      payload: {
        constraintId: 'c-1',
        kind: 'FREEFORM',
        displayText: 'no overhead press',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a constraint_notice with an invalid kind', () => {
    const result = aiMessageSegmentSchema.safeParse({
      type: 'constraint_notice',
      content: 'x',
      payload: {
        constraintId: 'c-1',
        kind: 'SOMETHING_ELSE',
        displayText: 'y',
      },
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: orchestrator enforces the schema
// ---------------------------------------------------------------------------

describe('orchestrator enforces the structured-output schema', () => {
  it('retries once, then fails with STRUCTURED_OUTPUT_FAILED when the claim is untagged twice', async () => {
    const provider = new MockProvider();
    // Both attempts: a claim segment missing its required `tag`. Raw JSON,
    // bypassing the type system, because that is what a misbehaving model
    // would actually produce.
    const bad = JSON.stringify({
      segments: [{ type: 'claim', content: 'x' }],
    });
    provider.queueText(bad);
    provider.queueText(bad);

    const { deps, persistSpy } = makeStubOrchestratorDeps(provider);
    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    const errorChunk = chunks.find((c) => c.type === 'error');
    expect(errorChunk).toBeDefined();
    if (errorChunk?.type === 'error') {
      expect(errorChunk.code).toBe('STRUCTURED_OUTPUT_FAILED');
    }
    expect(provider.calls).toBe(2);

    const assistant = persistSpy.calls.find((c) => c.role === 'ASSISTANT');
    expect(assistant?.errorCode).toBe('STRUCTURED_OUTPUT_FAILED');
  });

  it('succeeds on the retry when the second attempt is well-formed', async () => {
    const provider = new MockProvider();
    provider.queueText(
      JSON.stringify({ segments: [{ type: 'claim', content: 'x' }] }),
    );
    provider.queueText(
      finalTurnJson([
        { type: 'claim', tag: 'INTERPRETED', content: 'a valid response' },
      ]),
    );

    const { deps } = makeStubOrchestratorDeps(provider);
    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    expect(chunks.find((c) => c.type === 'error')).toBeUndefined();
    const final = chunks.find((c) => c.type === 'final');
    expect(final).toBeDefined();
    if (final?.type === 'final') {
      expect(
        final.segments.some(
          (s) => s.type === 'claim' && s.content === 'a valid response',
        ),
      ).toBe(true);
    }
  });

  it('rejects a model-emitted apply_confirmation on both attempts', async () => {
    const provider = new MockProvider();
    const sneaky = JSON.stringify({
      segments: [
        {
          type: 'apply_confirmation',
          content: 'x',
          payload: { simulationId: 'sim-1', summary: 'y' },
        },
      ],
    });
    provider.queueText(sneaky);
    provider.queueText(sneaky);

    const { deps, persistSpy } = makeStubOrchestratorDeps(provider);
    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    const errorChunk = chunks.find((c) => c.type === 'error');
    expect(errorChunk).toBeDefined();
    if (errorChunk?.type === 'error') {
      expect(errorChunk.code).toBe('STRUCTURED_OUTPUT_FAILED');
    }
    const assistant = persistSpy.calls.find((c) => c.role === 'ASSISTANT');
    // The apply_confirmation must not appear anywhere in the persisted
    // message — the model cannot smuggle one past the schema.
    expect(
      assistant?.segments.some((s) => s.type === 'apply_confirmation'),
    ).toBe(false);
  });
});