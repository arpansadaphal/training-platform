import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Structured-output schema for the Coach's final turn.
 *
 * Two schemas live here:
 *
 *   1. `modelOutputSchema` — the constraint on what the MODEL may emit on its
 *      final turn. Restricted to `text` and `claim` segments. The other
 *      segment types (`apply_confirmation`, `constraint_notice`,
 *      `temporary_constraint_notice`, `grounding_warning`) are constructed
 *      by the server from tool results or by the orchestrator on the
 *      grounding-failure path. The model has no business emitting them, and
 *      the schema enforces that.
 *
 *   2. `aiMessageSegmentSchema` — the full persisted segment union. Used by
 *      the orchestrator to validate tool-produced segments before they're
 *      merged with the final-text segments. A tool that produces a malformed
 *      segment is a bug and should surface loudly, not get persisted.
 *
 * The system prompt embeds `MODEL_OUTPUT_SCHEMA_JSON` (derived from
 * `modelOutputSchema` via zod-to-json-schema) so the schema the model sees
 * and the schema the orchestrator enforces cannot drift. Single source of
 * truth, same principle as the tool input schemas.
 */

const evidenceTagSchema = z.enum([
  'PLANNED',
  'EXECUTED',
  'OBSERVED',
  'INTERPRETED',
]);

const segmentSourceRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('axis'), key: z.string() }),
  z.object({ kind: z.literal('simulation'), id: z.string() }),
  z.object({ kind: z.literal('assessment') }),
  z.object({ kind: z.literal('analysis') }),
  z.object({ kind: z.literal('observation'), id: z.string() }),
  z.object({ kind: z.literal('session'), id: z.string() }),
  z.object({ kind: z.literal('constraint'), id: z.string() }),
  z.object({ kind: z.literal('temporary_constraint'), id: z.string() }),
]);

/**
 * The two segment types the model is permitted to emit.
 */
const modelEmittedSegmentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    content: z.string().min(1),
  }),
  z.object({
    type: z.literal('claim'),
    tag: evidenceTagSchema.describe(
      'Required on every claim. PLANNED = a design fact about the program as ' +
        'written. EXECUTED = a fact about what was actually performed. ' +
        'OBSERVED = a fact from the user\'s own subjective notes. ' +
        'INTERPRETED = your own reasoning or evaluation.',
    ),
    content: z.string().min(1),
    sourceRef: segmentSourceRefSchema
      .optional()
      .describe(
        'Optional reference back to the analysis/assessment/simulation the ' +
          'claim is grounded in. Include this whenever the claim references a ' +
          'specific axis, simulation, or observation — it lets the UI link ' +
          'the claim to its source.',
      ),
  }),
]);

export const modelOutputSchema = z
  .object({
    segments: z
      .array(modelEmittedSegmentSchema)
      .min(1)
      .max(20)
      .describe(
        'The full response, as an ordered list of segments. Include at least ' +
          'one segment. Order matters: the UI renders them top to bottom.',
      ),
  })
  .strict();

/** Full segment union, including server-produced segment types. */
export const aiMessageSegmentSchema = z.discriminatedUnion('type', [
  ...modelEmittedSegmentSchema.options,
  z.object({
    type: z.literal('apply_confirmation'),
    content: z.string(),
    payload: z.object({
      simulationId: z.string().min(1),
      summary: z.string(),
    }),
  }),
  z.object({
    type: z.literal('constraint_notice'),
    content: z.string(),
    payload: z.object({
      constraintId: z.string().min(1),
      kind: z.enum([
        'EXERCISE_AVOIDANCE',
        'MOVEMENT_PATTERN_AVOIDANCE',
        'FREEFORM',
      ]),
      displayText: z.string(),
    }),
  }),
  z.object({
    type: z.literal('temporary_constraint_notice'),
    content: z.string(),
    payload: z.object({
      temporaryConstraintId: z.string().min(1),
      conversationId: z.string().min(1),
      displayText: z.string(),
    }),
  }),
  z.object({
    type: z.literal('grounding_warning'),
    content: z.string(),
  }),
]);

/**
 * The JSON Schema the system prompt shows the model. Exported as a string so
 * the prompt-builder doesn't have to remember to stringify, and so a test can
 * assert the prompt contains the current schema.
 */
export const MODEL_OUTPUT_SCHEMA_JSON: string = JSON.stringify(
  zodToJsonSchema(modelOutputSchema, { $refStrategy: 'none' }),
  null,
  2,
);

/**
 * Parse the model's raw final text as a JSON object.
 *
 * The system prompt asks for a bare JSON object as the entire final message.
 * Models sometimes add markdown fences or leading/trailing prose anyway. This
 * function tolerates both without ever *interpreting* prose — it either finds
 * a JSON object and returns the parsed value, or it throws. It does not
 * attempt to repair malformed JSON.
 *
 * Callers must run the returned value through `modelOutputSchema.safeParse`
 * before trusting it.
 */
export function parseModelOutput(rawText: string): unknown {
  const text = rawText.trim();
  if (text.length === 0) {
    throw new Error('Model output was empty');
  }

  // Strip a single markdown fence if the whole message is fenced.
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    const candidate =
    fenced !== null && fenced[1] !== undefined ? fenced[1].trim() : text;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the outermost { ... } slice. This handles the case where
    // the model wrote a sentence of framing before the JSON despite the
    // instruction not to.
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) {
      throw new Error('No JSON object found in model output');
    }
    return JSON.parse(candidate.slice(first, last + 1));
  }
}