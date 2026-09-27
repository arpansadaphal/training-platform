import { describe, expect, it } from 'vitest';

import {
  buildAllowedNumbers,
  checkGrounding,
  dropOffendingAndAddWarning,
  extractNumericTokens,
  MockProvider,
  runCoachTurn,
} from '..';
import type { AIMessageSegment, CoachContext } from '..';

import {
  drain,
  finalTurnJson,
  makeStubOrchestratorDeps,
  TURN_INPUT,
} from './test-helpers';

// ---------------------------------------------------------------------------
// Numeric tokenizer
// ---------------------------------------------------------------------------

describe('extractNumericTokens', () => {
  it('extracts integer and decimal tokens', () => {
    expect(extractNumericTokens('12 sets at 3.5 rpe, 0.25 rest')).toEqual([
      '12',
      '3.5',
      '0.25',
    ]);
  });

  it('normalizes trailing zeros and leading zeros', () => {
    expect(extractNumericTokens('2.0 and 02 and 2')).toEqual(['2', '2', '2']);
  });

  it('returns an empty array for text with no digits', () => {
    expect(extractNumericTokens('no numbers here')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Allowed-numbers set
// ---------------------------------------------------------------------------

const EMPTY_CONTEXT: CoachContext = {
  currentProgramVersion: null,
  activeGoal: null,
  persistentConstraints: [],
  temporaryConstraints: [],
  recentHistorySummary: null,
  conversationHistory: [],
};

describe('buildAllowedNumbers', () => {
  it('collects numbers from nested objects, arrays, and strings', () => {
    const allowed = buildAllowedNumbers({
      context: EMPTY_CONTEXT,
      toolResults: [{ targetSets: 3, note: 'did 12 reps at 80kg' }],
    });
    expect(allowed.has('3')).toBe(true);
    expect(allowed.has('12')).toBe(true);
    expect(allowed.has('80')).toBe(true);
  });

  it('collects numbers from the context block', () => {
    const allowed = buildAllowedNumbers({
      context: {
        ...EMPTY_CONTEXT,
        activeGoal: { id: 'g-7', profileKey: 'HYPERTROPHY' },
      },
      toolResults: [],
    });
    expect(allowed.has('7')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkGrounding
// ---------------------------------------------------------------------------

describe('checkGrounding', () => {
  it('passes when the model emits no numbers', () => {
    const result = checkGrounding({
      context: EMPTY_CONTEXT,
      toolResults: [],
      segments: [{ type: 'text', content: 'Everything looks fine.' }],
    });
    expect(result.ok).toBe(true);
  });

  it('passes when the model restates a number from a tool result', () => {
    const result = checkGrounding({
      context: EMPTY_CONTEXT,
      toolResults: [{ sets: 3 }],
      segments: [
        { type: 'claim', tag: 'PLANNED', content: 'You have 3 sets.' },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('fails when the model emits a number not present anywhere', () => {
    const result = checkGrounding({
      context: EMPTY_CONTEXT,
      toolResults: [],
      segments: [
        { type: 'claim', tag: 'PLANNED', content: 'You have 42 sets.' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.offendingTokens).toEqual([{ token: '42', segmentIndex: 0 }]);
    expect(result.offendingSegmentIndices).toEqual([0]);
  });

  it('ignores server-produced segments entirely', () => {
    // An apply_confirmation carries a server-built simulationId whose digits
    // are not model claims. Skipping the segment type is deliberate.
    const result = checkGrounding({
      context: EMPTY_CONTEXT,
      toolResults: [],
      segments: [
        {
          type: 'apply_confirmation',
          content: 'Apply simulated change',
          payload: { simulationId: 'sim-999', summary: 'Add 5 sets' },
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('reports every offending segment index', () => {
    const result = checkGrounding({
      context: EMPTY_CONTEXT,
      toolResults: [],
      segments: [
        { type: 'text', content: 'fine' },
        { type: 'text', content: 'seven 999 here' },
        { type: 'claim', tag: 'OBSERVED', content: 'and 888 there' },
      ],
    });
    expect(result.offendingSegmentIndices).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// dropOffendingAndAddWarning
// ---------------------------------------------------------------------------

describe('dropOffendingAndAddWarning', () => {
  it('drops only the offending segments and appends a visible warning', () => {
    const segments: AIMessageSegment[] = [
      { type: 'text', content: 'First' },
      { type: 'text', content: 'Second 999' },
      { type: 'text', content: 'Third' },
    ];
    const out = dropOffendingAndAddWarning(segments, [1]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ type: 'text', content: 'First' });
    expect(out[1]).toEqual({ type: 'text', content: 'Third' });
    expect(out[2]?.type).toBe('grounding_warning');
  });

  it('produces a lone warning when every segment was offending', () => {
    const out = dropOffendingAndAddWarning(
      [{ type: 'text', content: 'One 999' }],
      [0],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe('grounding_warning');
  });
});

// ---------------------------------------------------------------------------
// Orchestrator-level grounding gate
// ---------------------------------------------------------------------------

describe('orchestrator grounding gate (end to end)', () => {
  it('re-prompts once, then withholds the offending segment with a warning', async () => {
    const provider = new MockProvider();
    // Attempt 0: an out-of-context number.
    provider.queueText(
      finalTurnJson([
        {
          type: 'claim',
          tag: 'INTERPRETED',
          content: 'You need 999 more sets.',
        },
      ]),
    );
    // Attempt 1: same out-of-context number. Retry exhausted.
    provider.queueText(
      finalTurnJson([
        {
          type: 'claim',
          tag: 'INTERPRETED',
          content: 'You need 999 more sets.',
        },
      ]),
    );

    const { deps, persistSpy } = makeStubOrchestratorDeps(provider);
    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    const final = chunks.find((c) => c.type === 'final');
    expect(final).toBeDefined();
    if (!final || final.type !== 'final') return;

    // No claim with 999 survived; a warning was appended instead.
    const survivedNumbers = final.segments.flatMap((s) =>
      s.type === 'claim' || s.type === 'text'
        ? extractNumericTokens(s.content)
        : [],
    );
    expect(survivedNumbers).not.toContain('999');
    expect(final.segments.some((s) => s.type === 'grounding_warning')).toBe(
      true,
    );

    // Exactly one retry — provider called twice total.
    expect(provider.calls).toBe(2);

    // One user persist + one assistant persist.
    expect(persistSpy.calls.filter((c) => c.role === 'USER')).toHaveLength(1);
    expect(persistSpy.calls.filter((c) => c.role === 'ASSISTANT')).toHaveLength(
      1,
    );
  });

  it('the retry succeeds when the second attempt is grounded', async () => {
    const provider = new MockProvider();
    provider.queueText(
      finalTurnJson([
        {
          type: 'claim',
          tag: 'INTERPRETED',
          content: 'You need 999 more sets.',
        },
      ]),
    );
    provider.queueText(
      finalTurnJson([
        {
          type: 'claim',
          tag: 'INTERPRETED',
          content: 'I cannot give you a specific number here.',
        },
      ]),
    );

    const { deps } = makeStubOrchestratorDeps(provider);
    const chunks = await drain(runCoachTurn(deps, TURN_INPUT));

    const final = chunks.find((c) => c.type === 'final');
    if (!final || final.type !== 'final') return;

    // No warning — the retry landed clean.
    expect(final.segments.some((s) => s.type === 'grounding_warning')).toBe(
      false,
    );
    // The retry's content is what's persisted.
    expect(
      final.segments.some(
        (s) => s.type === 'claim' && s.content.includes('specific number'),
      ),
    ).toBe(true);
  });
});