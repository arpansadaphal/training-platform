// The coach-parity matcher: does the engine's headline contain a problem the coach named, in the direction the
// coach named it? Structure against structure; no prose is parsed.
//
// Rules (each pinned in parity.test.ts; none is ever loosened to turn a FAIL into a PASS):
//   - The computed headline is the engine's first-ranked finding (or, before findings exist, its biggest
//     opportunity), expanded into {subject, direction} pairs. A pair is `lead` when it names the finding's lead
//     axis and `member` when it names something the finding contains (a region contains its muscles).
//   - Containment is ONE-WAY: a broad finding contains its narrower subjects, never the reverse. A headline
//     "lats volume is low" does not satisfy `pattern:pull`.
//   - Expected `low` accepts a computed `missing` (0 sets is lower than low). Every other direction must be equal.
//   - Expected `none` (the coach found nothing to fix) passes only when the headline is EMPTY. It is the only
//     way a program with no findings can pass; any program whose coach line names a problem fails until the
//     engine produces that problem.
import type { AssessedAxis, Assessment, AssessmentFinding } from "../../src/assessment/types";

export type Direction = "low" | "missing" | "high" | "none";

export interface ExpectedMatch {
  readonly subject: string;
  readonly direction: Direction;
}

export type Via = "lead" | "member";

export interface HeadlineSubject extends ExpectedMatch {
  readonly via: Via;
}

export interface Headline {
  /** Where the headline came from: no finding at all, the legacy biggest opportunity, or a ranked finding. */
  readonly source: "none" | "biggestOpportunity" | "finding";
  /** `VOLUME:calves`, `REGION:lower`, ... for printing. Empty when there is no headline. */
  readonly label: string;
  readonly subjects: readonly HeadlineSubject[];
}

export interface MatchResult {
  readonly pass: boolean;
  /** `lead` or `contained` for a substantive pass; `empty` for a `none` pass; null on FAIL. */
  readonly kind: "lead" | "contained" | "empty" | null;
  readonly matched: ExpectedMatch | null;
}

// ---- the closed vocabulary ----
export const VOCAB_MUSCLES: readonly string[] = [
  "chest", "lats", "upper back", "side delts", "rear delts", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves",
];
export const VOCAB_REGIONS: readonly string[] = ["upper", "lower", "arms"];
export const VOCAB_PATTERNS: readonly string[] = ["pull", "hinge", "squat", "vertical-push", "vertical-pull"];
export const VOCAB_CHECKS: readonly string[] = [
  "effort-defined", "near-failure", "far-from-failure", "rep-range", "percent-1rm",
];
const VOCAB_BARE: readonly string[] = [
  "frequency", "recovery", "global-volume", "session-size", "time-budget", "push-pull", "none",
];

/** True when an EXPECTED subject is in the closed vocabulary. */
export function isKnownSubject(subject: string): boolean {
  if (VOCAB_BARE.includes(subject)) return true;
  const [kind, name] = subject.split(":", 2);
  if (name === undefined) return false;
  if (kind === "muscle") return VOCAB_MUSCLES.includes(name);
  if (kind === "region") return VOCAB_REGIONS.includes(name);
  if (kind === "pattern") return VOCAB_PATTERNS.includes(name);
  if (kind === "check") return VOCAB_CHECKS.includes(name);
  return false;
}

// ---- computed headline ----
/** Progression check id -> the subject and direction a coach names it with. */
const CHECK_SUBJECT: Readonly<Record<string, { subject: string; direction: Direction }>> = {
  EFFORT_DEFINED: { subject: "check:effort-defined", direction: "low" },
  FAR_FROM_FAILURE: { subject: "check:far-from-failure", direction: "high" },
  REP_RANGE: { subject: "check:rep-range", direction: "low" },
  PERCENT_1RM_FEASIBILITY: { subject: "check:percent-1rm", direction: "high" },
  NEAR_FAILURE: { subject: "check:near-failure", direction: "high" },
};

function axisSubjects(axis: AssessedAxis, via: Via): HeadlineSubject[] {
  const band = axis.status.band;
  const value = typeof axis.metricValue === "number" ? axis.metricValue : null;
  switch (axis.axisType) {
    case "VOLUME": {
      const subject = `muscle:${axis.scopeKey ?? "?"}`;
      if (band === "Low") return [{ subject, direction: value === 0 ? "missing" : "low", via }];
      if (band === "High" || band === "Excessive") return [{ subject, direction: "high", via }];
      return [];
    }
    case "FREQUENCY":
      if (band === "Low") return [{ subject: "frequency", direction: "low", via }];
      if (band === "High") return [{ subject: "frequency", direction: "high", via }];
      return [];
    case "EXERCISE_SELECTION_BALANCE":
      // No per-pattern facts reach the Assessment yet: the headline cannot say WHICH pattern is missing.
      return band === "Gaps present" ? [{ subject: "pattern:unspecified", direction: "missing", via }] : [];
    case "PROGRESSION_SOUNDNESS": {
      if (band !== "Issue found") return [];
      // Which checks failed is in the axis facts (engine 0.5.0). Without them the headline names no check.
      const failed = axis.facts?.failedChecks ?? [];
      const known = failed.flatMap((c) => (CHECK_SUBJECT[c.id] ? [{ ...CHECK_SUBJECT[c.id]!, via }] : []));
      return known.length > 0 ? known : [{ subject: "check:unspecified", direction: "low", via }];
    }
    case "RECOVERY_COST":
      return band === "High" || band === "Excessive" ? [{ subject: "recovery", direction: "high", via }] : [];
  }
}

const axisLabel = (a: AssessedAxis): string => (a.scopeKey ? `${a.axisType}:${a.scopeKey}` : a.axisType);

/** Required movement pattern -> the pattern subject the vocabulary uses for it (those a coach names). */
const PATTERN_SUBJECT: Readonly<Record<string, string>> = {
  HINGE: "pattern:hinge",
  SQUAT: "pattern:squat",
  VERTICAL_PUSH: "pattern:vertical-push",
  VERTICAL_PULL: "pattern:vertical-pull",
};

/** Expand one finding. A broader finding contains its narrower subjects (a region its muscles), never the reverse. */
function findingSubjects(finding: AssessmentFinding): HeadlineSubject[] {
  const out: HeadlineSubject[] = [];
  const muscles = (): void => {
    for (const m of finding.members) {
      out.push({
        subject: `muscle:${m.muscle}`,
        direction: m.sets === 0 ? "missing" : "low",
        via: m.muscle === finding.lead.scopeKey ? "lead" : "member",
      });
    }
  };
  if (finding.kind === "REGION") {
    out.push({ subject: `region:${finding.region ?? "?"}`, direction: finding.absent ? "missing" : "low", via: "lead" });
    muscles();
  } else if (finding.kind === "PATTERN") {
    for (const key of finding.patterns ?? []) out.push({ subject: `pattern:${key}`, direction: "missing", via: "lead" });
    for (const p of finding.missingPatterns ?? []) {
      const subject = PATTERN_SUBJECT[p];
      if (subject !== undefined && !out.some((o) => o.subject === subject)) {
        out.push({ subject, direction: "missing", via: "lead" });
      }
    }
    muscles();
  } else {
    out.push(...axisSubjects(finding.lead, "lead"));
  }
  return out;
}

/**
 * Expand the engine's headline into subjects. Reads only what the Assessment carries: the first ranked finding
 * when the Assessment has findings (engine 0.5.0), otherwise its biggest opportunity.
 */
export function headlineOf(assessment: Pick<Assessment, "biggestOpportunity"> & { findings?: Assessment["findings"] }): Headline {
  const finding = assessment.findings?.[0];
  if (finding !== undefined) return { source: "finding", label: finding.key, subjects: findingSubjects(finding) };
  const lead = assessment.biggestOpportunity;
  if (lead === null) return { source: "none", label: "", subjects: [] };
  return { source: "biggestOpportunity", label: axisLabel(lead), subjects: axisSubjects(lead, "lead") };
}

// ---- matching ----
export function directionSatisfies(expected: Direction, actual: Direction): boolean {
  return expected === actual || (expected === "low" && actual === "missing");
}

export function matchHeadline(expected: readonly ExpectedMatch[], headline: Headline): MatchResult {
  const wantsNone = expected.some((e) => e.subject === "none");
  if (wantsNone) {
    return headline.subjects.length === 0 && headline.source === "none"
      ? { pass: true, kind: "empty", matched: { subject: "none", direction: "none" } }
      : { pass: false, kind: null, matched: null };
  }
  // Prefer a lead match over a contained one, so the report says the stronger thing when both hold.
  for (const via of ["lead", "member"] as const) {
    for (const got of headline.subjects) {
      if (got.via !== via) continue;
      const hit = expected.find((e) => e.subject === got.subject && directionSatisfies(e.direction, got.direction));
      if (hit) return { pass: true, kind: via === "lead" ? "lead" : "contained", matched: hit };
    }
  }
  return { pass: false, kind: null, matched: null };
}
