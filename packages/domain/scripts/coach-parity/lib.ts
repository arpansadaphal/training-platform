// Audit harness: drives the REAL domain engine with the seed's involvement data loaded in memory.
// Read-only: no DB, no repo writes.
import { readFileSync } from "node:fs";
const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
import { computeAnalysis } from "../../src/analysis/computeAnalysis";
import { computeAssessment } from "../../src/assessment/computeAssessment";
import { provisionalFitBand } from "../../src/assessment/provisionalFit";
import { evaluateProgressionChecks } from "../../src/analysis/progressionSoundness";
import { nameActions } from "../../src/assessment/namedActions";
import { ratioLines } from "../../src/copy/ratioLines";
import { axisSentence } from "../../src/copy/axisSentence";
import { HYPERTROPHY_CONFIG, hypertrophyProfile } from "../../src/goal-profiles/hypertrophy";
import { scopeReferenceDataToGoal } from "../../src/reference/scopeReferenceData";
import type { ProgramStructure, LoadScheme } from "../../src/types";
import type { ExerciseReferenceData } from "../../src/analysis/types";
import type { AssessedAxis } from "../../src/assessment/types";

// ---- seed extraction (text slice of packages/db/prisma/seed.ts, evaluated as a JS literal) ----
const seedText = readFileSync(`${ROOT}/packages/db/prisma/seed.ts`, "utf8");
function slice(startMarker: string): string {
  const s = seedText.indexOf(startMarker);
  if (s < 0) throw new Error(`marker not found: ${startMarker}`);
  const open = seedText.indexOf("[", s + startMarker.length - 1);
  const close = seedText.indexOf("\n]", open);
  return seedText.slice(open, close + 2);
}
const MUSCLES: string[] = new Function(`return ${slice("const MUSCLE_GROUPS = [")}`)();
type SeedEx = { name: string; movementPattern: string; equipment?: string; involvements: Record<string, number> };
const EXERCISES: SeedEx[] = new Function(`return ${slice("const EXERCISES: SeedExercise[] = [")}`)();

const full: ExerciseReferenceData = {
  exercises: EXERCISES.map((e) => ({ id: e.name, name: e.name, movementPattern: e.movementPattern as never, equipment: e.equipment ?? null })),
  muscleGroups: MUSCLES.map((m) => ({ id: m, name: m })),
  involvements: EXERCISES.flatMap((e) =>
    Object.entries(e.involvements).map(([m, f]) => ({ exerciseId: e.name, muscleGroupId: m, involvementFactor: f })),
  ),
};
export const REF = scopeReferenceDataToGoal(full, hypertrophyProfile.relevantMuscleGroups);
export const EX = new Map(EXERCISES.map((e) => [e.name, e]));

// ---- program DSL: [exercise, sets, repLo, repHi, rpe | null] ----
export type Row = [string, number, number, number, (number | null)?];
export interface Day { name: string; rows: Row[] }
export interface Program { id: string; title: string; days: Day[]; note?: string }

export function build(p: Program, defaultRpe: number | null = 8): ProgramStructure {
  return {
    workoutDays: p.days.map((d, di) => ({
      id: `d${di}`, orderIndex: di, name: d.name,
      prescriptions: d.rows.map(([ex, sets, lo, hi, rpeIn], ri) => {
        if (!EX.has(ex)) throw new Error(`Not in seed: ${ex} (program ${p.id})`);
        const rpe = rpeIn === undefined ? defaultRpe : rpeIn;
        const loadScheme: LoadScheme = rpe === null ? { type: "FIXED_WEIGHT", weight: 20, unit: "kg" } : { type: "RPE_BASED", rpe };
        return { id: `d${di}r${ri}`, orderIndex: ri, exerciseId: ex, targetSets: sets, targetRepsLow: lo, targetRepsHigh: hi,
          ...(rpe === null ? {} : { targetRpe: rpe }), loadScheme };
      }),
    })),
  };
}

const n1 = (x: number) => String(Math.round(x * 10) / 10);
const label = (a: { axisType: string; scopeKey: string | null }) => (a.scopeKey ? `${a.axisType}:${a.scopeKey}` : a.axisType);

export function run(p: Program, opts: { defaultRpe?: number | null; quiet?: boolean } = {}) {
  const structure = build(p, opts.defaultRpe === undefined ? 8 : opts.defaultRpe);
  const analysis = computeAnalysis(structure, REF, HYPERTROPHY_CONFIG, { now: () => new Date("2026-01-01T00:00:00Z") });
  const result = computeAssessment(analysis, HYPERTROPHY_CONFIG, { goalId: "g" });
  const a = result.assessment;
  const fit = provisionalFitBand(result);
  const checks = evaluateProgressionChecks(structure, HYPERTROPHY_CONFIG);
  if (opts.quiet) return { analysis, a, fit, checks };

  const L: string[] = [];
  const totalSets = p.days.reduce((s, d) => s + d.rows.reduce((t, r) => t + r[1], 0), 0);
  L.push(`\n=== ${p.id}: ${p.title} — ${p.days.length} days listed, ${totalSets} sets ===`);
  if (p.note) L.push(`  note: ${p.note}`);
  L.push(`  per-day sets: ${p.days.map((d) => `${d.name} ${d.rows.reduce((t, r) => t + r[1], 0)}`).join(" | ")}`);
  const vol = a.allAssessedAxes.filter((x) => x.axisType === "VOLUME");
  L.push(`  VOLUME: ${vol.map((x) => `${x.scopeKey} ${n1(x.metricValue as number)}${x.status.band === "Adequate" ? "" : `(${x.status.band})`}`).join(", ")}`);
  const fq = a.allAssessedAxes.filter((x) => x.axisType === "FREQUENCY" && x.status.band !== "Adequate");
  L.push(`  FREQUENCY non-adequate: ${fq.map((x) => `${x.scopeKey} ${n1(x.metricValue as number)} ${x.status.band}`).join(", ") || "none"}`);
  const prog = (t: string) => a.allAssessedAxes.find((x) => x.axisType === t)!;
  const esb = prog("EXERCISE_SELECTION_BALANCE"), ps = prog("PROGRESSION_SOUNDNESS"), rc = prog("RECOVERY_COST");
  L.push(`  ESB ${n1((esb.metricValue as number) * 6)}/6 ${esb.status.band} (lev ${esb.leverage}) | PS ${ps.status.band} (lev ${ps.leverage}) failed: ${checks.filter((c) => c.failed).map((c) => `${c.id} [${c.detail}]`).join("; ") || "none"} | RC ${n1(rc.metricValue as number)} ${rc.status.band} (lev ${rc.leverage})`);
  const things = a.attentionAreas.length + (a.biggestOpportunity ? 1 : 0);
  L.push(`  UI HEADLINE: "Provisional fit: ${fit ? fit.band.replace("_", " ") : "(none)"}" · "${a.strengths.length} strengths · ${things} things to look at${a.biggestOpportunity ? `. Biggest opportunity: ${label(a.biggestOpportunity)}` : ""}."`);
  if (a.biggestOpportunity) L.push(`  BIGGEST: ${sentence(a.biggestOpportunity)}`);
  for (const x of a.attentionAreas) L.push(`  ATTN: ${label(x)} — ${sentence(x)}`);
  L.push(`  ACTIONS (${a.actions.length}): ${a.actions.map((x) => x.description).join(" | ") || "none"}`);
  const named = nameActions(a, structure, REF, HYPERTROPHY_CONFIG);
  L.push(`  NAMED ACTIONS: ${named.map((x) => x.description).join(" | ") || "none"}`);
  L.push(`  RATIOS: ${ratioLines(a.ratios).join(" ") || "none"}`);
  L.push(`  SILENT (computed, never shown): ${a.allAssessedAxes.filter((x) => x.severity !== "NONE" && !a.attentionAreas.includes(x) && x !== a.biggestOpportunity).map((x) => `${label(x)}=${x.status.band}`).join(", ") || "none"}`);
  // Auditor-computed facts (NOT engine output): what a coach glances at first.
  const pat = (names: string[]) => p.days.reduce((s, d) => s + d.rows.filter((r) => names.includes(EX.get(r[0])!.movementPattern)).reduce((t, r) => t + r[1], 0), 0);
  const push = pat(["HORIZONTAL_PUSH", "VERTICAL_PUSH"]), pull = pat(["HORIZONTAL_PULL", "VERTICAL_PULL"]);
  const sq = pat(["SQUAT"]), hg = pat(["HINGE"]);
  const legCurl = p.days.reduce((s, d) => s + d.rows.filter((r) => /Leg Curl|Nordic/.test(r[0])).reduce((t, r) => t + r[1], 0), 0);
  const failSets = p.days.reduce((s, d) => s + d.rows.filter((r) => (r[4] ?? opts.defaultRpe ?? 0) >= 10).reduce((t, r) => t + r[1], 0), 0);
  const mins = p.days.map((d) => Math.round(d.rows.reduce((t, r) => t + r[1], 0) * 2.75 + 5));
  L.push(`  [auditor] push:pull compound sets ${push}:${pull} | squat:hinge ${sq}:${hg} | leg-curl sets ${legCurl} | to-failure sets ${failSets}/${totalSets} | est. minutes/session ${mins.join(",")}`);
  console.log(L.join("\n"));
  return { analysis, a, fit, checks };
}

function sentence(x: AssessedAxis): string {
  const s = axisSentence(x, HYPERTROPHY_CONFIG.statusBands[x.axisType] ?? []);
  return s ?? `[${x.status.band}; no sentence — card shows generic meaning text]`;
}
