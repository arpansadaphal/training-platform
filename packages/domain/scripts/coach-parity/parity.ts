// Coach-parity score: runs the real engine on the 25 expected programs, in production muscle order (name
// ascending, as listMuscleGroups returns), and compares each engine headline with the coach's.
//
//   pnpm coach-parity:score
//
// Read-only: no database, no writes. Imported by parity.test.ts, which pins the passing set.
import { pathToFileURL } from "node:url";
import { axisSentence } from "../../src/copy/axisSentence";
import { findingSentence } from "../../src/copy/findingSentence";
import { HYPERTROPHY_CONFIG } from "../../src/goal-profiles/hypertrophy";
import type { AssessedAxis } from "../../src/assessment/types";
import { EXPECTED_HEADLINES, type ExpectedHeadline } from "./expected";
import { REF, run } from "./lib";
import { headlineOf, matchHeadline, type Headline, type MatchResult } from "./matcher";

export interface ParityRow {
  readonly expected: ExpectedHeadline;
  readonly headline: Headline;
  /** The sentence the user would read for the engine's headline ("" when there is none). */
  readonly sentence: string;
  readonly result: MatchResult;
}

export interface ParityScore {
  readonly rows: readonly ParityRow[];
  readonly passed: number;
  readonly total: number;
}

function sentenceFor(axis: AssessedAxis): string {
  const s = axisSentence(axis, HYPERTROPHY_CONFIG.statusBands[axis.axisType] ?? []);
  return s ?? `[${axis.axisType}: ${axis.status.band}; no sentence, the card shows generic meaning text]`;
}

export function scoreAll(): ParityScore {
  // Production loads muscle groups sorted by name; the headline tie-break depends on that order.
  REF.muscleGroups.sort((a, b) => a.name.localeCompare(b.name));
  const rows: ParityRow[] = EXPECTED_HEADLINES.map((expected) => {
    const { a } = run(expected.program, { defaultRpe: expected.defaultRpe, quiet: true });
    const headline = headlineOf(a);
    const finding = a.findings?.[0];
    const sentence = finding
      ? (findingSentence(finding, HYPERTROPHY_CONFIG) ?? sentenceFor(finding.lead))
      : a.biggestOpportunity
        ? sentenceFor(a.biggestOpportunity)
        : "";
    return { expected, headline, sentence, result: matchHeadline(expected.match, headline) };
  });
  return { rows, passed: rows.filter((r) => r.result.pass).length, total: rows.length };
}

const fmtMatch = (m: { subject: string; direction: string }): string => `${m.subject}/${m.direction}`;

export function formatReport(score: ParityScore): string {
  const L: string[] = [];
  for (const { expected, headline, sentence, result } of score.rows) {
    const tag = result.pass ? `PASS (${result.kind})` : "FAIL";
    L.push(`${tag.padEnd(16)} ${expected.id.padEnd(6)} ${expected.program.title}`);
    L.push(`    coach : ${expected.expectedHeadline}`);
    L.push(`    engine: ${sentence || (headline.source === "none" ? "(no finding)" : headline.label)}`);
    L.push(
      result.pass
        ? `    matched ${result.matched ? fmtMatch(result.matched) : "?"}`
        : `    wanted ${expected.match.map(fmtMatch).join(" | ")}; engine says ${
            headline.subjects.map(fmtMatch).join(" | ") || "nothing"
          }`,
    );
  }
  L.push("");
  L.push(`COACH PARITY: ${score.passed}/${score.total}`);
  const contained = score.rows.filter((r) => r.result.kind === "contained").map((r) => r.expected.id);
  if (contained.length > 0) L.push(`contained (not a direct hit): ${contained.join(", ")}`);
  L.push(`pass: ${score.rows.filter((r) => r.result.pass).map((r) => r.expected.id).join(", ") || "none"}`);
  L.push(`fail: ${score.rows.filter((r) => !r.result.pass).map((r) => r.expected.id).join(", ") || "none"}`);
  return L.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(formatReport(scoreAll()));
}
