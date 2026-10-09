// packages/api/src/services/calibration.test.ts
//
// CALIBRATION HARNESS. Runs the REAL domain engine (computeAnalysis -> computeAssessment ->
// computeFitScore) over the ten programs from shadow_engine_calibration.py, using the REAL seeded
// reference data via loadExerciseReferenceData (scoped to the HYPERTROPHY goal) and the REAL
// HYPERTROPHY_CONFIG (validated: false).
//
// THIS IS NOT A PASS/FAIL CALIBRATION. Assertions below are structural invariants only (seed
// convention, scope, profile gate, roll-up completeness, translation sanity). Engine OUTPUTS are
// logged, never asserted, so a surprising result prints instead of failing. Do not edit thresholds or
// bands to change what is logged.
//
// Requirements: a database seeded with packages/db/prisma/seed.ts (the reseeded 1.0 / 0.5 version).
// The harness only READS reference tables; it creates no users or programs, so there is nothing to
// clean up (no makeTestUser / cleanupTrackedUsers needed).
//
// Run:  pnpm --filter @training/api test calibration.test.ts

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertDefined, listExercises } from "@training/db";
import {
  computeAnalysis,
  computeAssessment,
  computeFitScore,
  goalProfileRegistry,
  type Analysis,
  type AssessedAxis,
  type AssessmentResult,
  type ExerciseReferenceData,
  type FitScoreResult,
  type GoalProfileConfig,
  type LoadScheme,
  type ProgramStructure,
} from "@training/domain";
import { loadExerciseReferenceData } from "./referenceDataService";
// EDIT 1 — imports (add):
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GOAL_PROFILE_KEY = "HYPERTROPHY";
const GOAL_ID = "test-goal";
const FIXED_NOW = () => new Date("2026-01-01T00:00:00.000Z");
const DAY_NAMES: readonly string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEVERAGE_RANK: Readonly<Record<AssessedAxis["leverage"], number>> = {
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
};

// ---------------------------------------------------------------------------
// Shorthand (shadow_engine_calibration.py) -> seeded exercise name (seed.ts).
// Where the seed has no exact equivalent the nearest seeded exercise BY MOVEMENT PATTERN is used
// (and, within that, by equipment / involvement). Choices are noted per line.
// ---------------------------------------------------------------------------
const SHORTHAND_TO_SEED: Readonly<Record<string, string>> = {
  bench_press: "Barbell Bench Press",
  incline_db_press: "Incline Barbell Bench Press", // no DB incline press seeded; HORIZONTAL_PUSH, same factors
  machine_chest_press: "Dumbbell Bench Press", // no machine press seeded; HORIZONTAL_PUSH, same factors
  push_up: "Push-Up",
  cable_fly: "Cable Chest Fly", // NB: seeded as HORIZONTAL_PUSH, not ISOLATION
  overhead_press: "Overhead Press",
  lateral_raise: "Lateral Raise",
  reverse_pec_deck: "Rear Delt Fly", // no pec deck seeded; same muscle (rear delts), ISOLATION
  face_pull: "Face Pull", // NB: seeded as OTHER (not counted by ESB)
  lat_pulldown: "Lat Pulldown",
  pull_up: "Pull-Up",
  seated_row: "Seated Cable Row",
  chest_supported_row: "Chest-Supported Row",
  barbell_row: "Barbell Row",
  triceps_pushdown: "Tricep Pushdown",
  overhead_triceps_ext: "Overhead Tricep Extension",
  biceps_curl: "Barbell Curl",
  hammer_curl: "Hammer Curl",
  incline_curl: "Hammer Curl", // no incline curl seeded; dumbbell curl -> Hammer Curl (biceps 1.0 either way)
  preacher_curl: "Barbell Curl", // no preacher curl seeded; bar curl -> Barbell Curl (biceps 1.0 either way)
  back_squat: "Back Squat",
  leg_press: "Leg Press",
  leg_extension: "Leg Extension",
  walking_lunge: "Hack Squat", // no lunge / split squat seeded; nearest knee-dominant SQUAT (quads 1.0, glutes 0.5)
  rdl: "Romanian Deadlift",
  leg_curl: "Leg Curl",
  seated_leg_curl: "Leg Curl", // no seated variant seeded
  hip_thrust: "Hip Thrust",
  standing_calf_raise: "Standing Calf Raise",
  seated_calf_raise: "Standing Calf Raise", // no seated variant seeded (soleus not separable anyway)
};

// ---------------------------------------------------------------------------
// Program definitions, translated from shadow_engine_calibration.py.
// r(shorthand, sets, [repsLow, repsHigh] = [8, 12], rir = 2). rir === null means "effort undefined".
// day = weekday index (0 = Mon). The real ProgramStructure keeps only the ORDER of days (orderIndex);
// weekdays, rest days and consecutive-day structure are NOT representable.
// ---------------------------------------------------------------------------
type Reps = readonly [number, number];
interface Row {
  readonly ex: string;
  readonly sets: number;
  readonly reps: Reps;
  readonly rir: number | null;
}
interface DaySpec {
  readonly day: number;
  readonly rows: readonly Row[];
}
interface ProgramSpec {
  readonly id: string;
  readonly description: string;
  readonly days: readonly DaySpec[];
}
const r = (ex: string, sets: number, reps: Reps = [8, 12], rir: number | null = 2): Row => ({
  ex,
  sets,
  reps,
  rir,
});

const PROGRAM_A: readonly DaySpec[] = [
  { day: 0, rows: [r("bench_press", 2, [6, 10]), r("lat_pulldown", 2), r("back_squat", 2, [6, 10])] },
  { day: 3, rows: [r("overhead_press", 2), r("seated_row", 2), r("rdl", 2, [8, 10])] },
];

const PROGRAM_B: readonly DaySpec[] = [
  {
    day: 0,
    rows: [
      r("bench_press", 3, [6, 10]),
      r("incline_db_press", 3),
      r("lat_pulldown", 3),
      r("seated_row", 3),
      r("lateral_raise", 3, [12, 20], 1),
      r("face_pull", 3, [12, 20], 1),
      r("triceps_pushdown", 3, [10, 15], 1),
    ],
  },
  {
    day: 1,
    rows: [
      r("back_squat", 3, [6, 10]),
      r("rdl", 3, [8, 10]),
      r("leg_extension", 3, [10, 15], 1),
      r("leg_curl", 3, [10, 15], 1),
      r("standing_calf_raise", 5, [8, 15], 1),
    ],
  },
  {
    day: 3,
    rows: [
      r("machine_chest_press", 3),
      r("cable_fly", 3, [10, 15], 1),
      r("pull_up", 3, [6, 10]),
      r("chest_supported_row", 3),
      r("overhead_press", 3, [6, 10]),
      r("reverse_pec_deck", 3, [12, 20], 1),
      r("lateral_raise", 3, [12, 20], 1),
    ],
  },
  {
    day: 4,
    rows: [
      r("leg_press", 3),
      r("hip_thrust", 3),
      r("seated_leg_curl", 3, [10, 15], 1),
      r("walking_lunge", 3, [10, 12]),
      r("seated_calf_raise", 4, [10, 15], 1),
    ],
  },
  {
    day: 5,
    rows: [
      r("overhead_triceps_ext", 3, [10, 15], 1),
      r("incline_curl", 3, [10, 15], 1),
      r("biceps_curl", 3, [10, 15], 1),
    ],
  },
];

const C_PUSH: readonly Row[] = [
  r("bench_press", 5, [6, 10], 1),
  r("incline_db_press", 4, [8, 12], 1),
  r("overhead_press", 4, [6, 10], 1),
  r("cable_fly", 4, [10, 15], 0),
  r("lateral_raise", 6, [12, 20], 0),
  r("triceps_pushdown", 5, [10, 15], 0),
  r("overhead_triceps_ext", 4, [10, 15], 0),
];
const C_PULL: readonly Row[] = [
  r("pull_up", 5, [6, 10], 1),
  r("barbell_row", 5, [6, 10], 1),
  r("seated_row", 4, [8, 12], 1),
  r("lat_pulldown", 4, [8, 12], 1),
  r("reverse_pec_deck", 5, [12, 20], 0),
  r("biceps_curl", 5, [10, 15], 0),
  r("hammer_curl", 4, [10, 15], 0),
];
const C_LEGS: readonly Row[] = [
  r("back_squat", 5, [6, 10], 1),
  r("rdl", 4, [8, 10], 1),
  r("leg_press", 4, [10, 15], 1),
  r("leg_curl", 4, [10, 15], 0),
  r("leg_extension", 4, [10, 15], 0),
  r("standing_calf_raise", 6, [8, 15], 0),
];
const PROGRAM_C: readonly DaySpec[] = [
  { day: 0, rows: C_PUSH },
  { day: 1, rows: C_PULL },
  { day: 2, rows: C_LEGS },
  { day: 3, rows: C_PUSH },
  { day: 4, rows: C_PULL },
  { day: 5, rows: C_LEGS },
];

const PROGRAM_D: readonly DaySpec[] = [
  {
    day: 0,
    rows: [
      r("bench_press", 4, [6, 10]),
      r("incline_db_press", 3),
      r("cable_fly", 3, [10, 15], 1),
      r("machine_chest_press", 3),
      r("triceps_pushdown", 3, [10, 15], 1),
      r("overhead_triceps_ext", 3, [10, 15], 1),
    ],
  },
  {
    day: 1,
    rows: [r("lat_pulldown", 4), r("barbell_row", 4, [6, 10]), r("seated_row", 3), r("pull_up", 3, [6, 10])],
  },
  {
    day: 2,
    rows: [
      r("back_squat", 4, [6, 10]),
      r("leg_press", 4),
      r("leg_extension", 4, [10, 15], 1),
      r("rdl", 4, [8, 10]),
      r("leg_curl", 3, [10, 15], 1),
      r("seated_leg_curl", 3, [10, 15], 1),
      r("standing_calf_raise", 5, [8, 15], 1),
      r("seated_calf_raise", 4, [10, 15], 1),
    ],
  },
  {
    day: 3,
    rows: [r("overhead_press", 3, [6, 10]), r("lateral_raise", 8, [12, 20], 1), r("reverse_pec_deck", 3, [12, 20], 1)],
  },
  {
    day: 4,
    rows: [
      r("biceps_curl", 4, [10, 15], 1),
      r("incline_curl", 3, [10, 15], 1),
      r("hammer_curl", 3, [10, 15], 1),
      r("hip_thrust", 3),
    ],
  },
];

const E_DAY_A: readonly Row[] = [
  r("bench_press", 2, [6, 10]),
  r("seated_row", 2),
  r("back_squat", 2, [6, 10]),
  r("lateral_raise", 2, [12, 20], 1),
  r("biceps_curl", 2, [10, 15], 1),
  r("triceps_pushdown", 2, [10, 15], 1),
  r("leg_curl", 2, [10, 15], 1),
  r("standing_calf_raise", 2, [8, 15], 1),
  r("face_pull", 2, [12, 20], 1),
];
const E_DAY_B: readonly Row[] = [
  r("overhead_press", 2, [6, 10]),
  r("lat_pulldown", 2),
  r("leg_press", 2),
  r("rdl", 2, [8, 10]),
  r("cable_fly", 2, [10, 15], 1),
  r("reverse_pec_deck", 2, [12, 20], 1),
  r("overhead_triceps_ext", 2, [10, 15], 1),
  r("incline_curl", 2, [10, 15], 1),
  r("lateral_raise", 2, [12, 20], 1),
  r("seated_calf_raise", 2, [10, 15], 1),
  r("hip_thrust", 2),
];
const PROGRAM_E: readonly DaySpec[] = [
  { day: 0, rows: E_DAY_A },
  { day: 1, rows: E_DAY_B },
  { day: 2, rows: E_DAY_A },
  { day: 3, rows: E_DAY_B },
  { day: 4, rows: E_DAY_A },
];

const F1_UPPER: readonly Row[] = [
  r("bench_press", 2, [6, 10]),
  r("incline_db_press", 2),
  r("machine_chest_press", 2),
  r("push_up", 2, [10, 20]),
  r("seated_row", 2),
  r("chest_supported_row", 2),
  r("barbell_row", 2, [6, 10]),
  r("lateral_raise", 3, [12, 20], 1),
  r("triceps_pushdown", 3, [10, 15], 1),
  r("biceps_curl", 2, [10, 15], 1),
  r("hammer_curl", 2, [10, 15], 1),
  r("preacher_curl", 2, [10, 15], 1),
  r("reverse_pec_deck", 3, [12, 20], 1),
];
const F1_LOWER: readonly Row[] = [
  r("back_squat", 4, [6, 10]),
  r("rdl", 3, [8, 10]),
  r("leg_extension", 3, [10, 15], 1),
  r("leg_curl", 3, [10, 15], 1),
  r("standing_calf_raise", 4, [8, 15], 1),
  r("seated_calf_raise", 3, [10, 15], 1),
];
const PROGRAM_F1: readonly DaySpec[] = [
  { day: 0, rows: F1_UPPER },
  { day: 1, rows: F1_LOWER },
  { day: 3, rows: F1_UPPER },
  { day: 4, rows: F1_LOWER },
];

const F2_UP1: readonly Row[] = [
  r("bench_press", 3, [6, 10]),
  r("incline_db_press", 3),
  r("machine_chest_press", 3),
  r("cable_fly", 3, [10, 15], 1),
  r("biceps_curl", 3, [10, 15], 1),
  r("hammer_curl", 3, [10, 15], 1),
  r("preacher_curl", 3, [10, 15], 1),
  r("triceps_pushdown", 3, [10, 15], 1),
];
const F2_UP2: readonly Row[] = [
  r("lat_pulldown", 3),
  r("seated_row", 3),
  r("lateral_raise", 3, [12, 20], 1),
  r("reverse_pec_deck", 3, [12, 20], 1),
];
const PROGRAM_F2: readonly DaySpec[] = [
  { day: 0, rows: F2_UP1 },
  { day: 1, rows: F2_UP2 },
  { day: 3, rows: F2_UP1 },
  { day: 4, rows: F2_UP2 },
];

// G: B's volume; reps fixed at 10-10; effort undefined on every even-indexed exercise of each day
// (shadow: `rir = None if i % 2 == 0`). The shadow's "no overload mechanism" and "+10% per week"
// fields have NO equivalent in ProgramStructure, so they are dropped. Effort-undefined rows become
// FIXED_WEIGHT with no targetRpe; the others RPE_BASED 8 (RIR 2).
const PROGRAM_G: readonly DaySpec[] = PROGRAM_B.map((d) => ({
  day: d.day,
  rows: d.rows.map((row, i) => ({ ...row, reps: [10, 10] as Reps, rir: i % 2 === 0 ? null : 2 })),
}));

// H: B + defined mechanisms / increments in the shadow. None of that exists in ProgramStructure, so H is
// structurally IDENTICAL to B. A test below asserts that.
const PROGRAM_H: readonly DaySpec[] = PROGRAM_B;

const J_DAY: readonly Row[] = [
  r("bench_press", 3, [6, 10], 0),
  r("seated_row", 3, [8, 12], 0),
  r("back_squat", 3, [6, 10], 0),
  r("rdl", 3, [8, 10], 0),
  r("lateral_raise", 3, [12, 20], 0),
  r("biceps_curl", 3, [10, 15], 0),
  r("triceps_pushdown", 3, [10, 15], 0),
  r("leg_curl", 3, [10, 15], 0),
  r("standing_calf_raise", 3, [8, 15], 0),
  r("face_pull", 3, [12, 20], 0),
];
const PROGRAM_J: readonly DaySpec[] = [
  { day: 0, rows: J_DAY },
  { day: 1, rows: J_DAY },
  { day: 2, rows: J_DAY },
  { day: 3, rows: J_DAY },
];

const PROGRAMS: readonly ProgramSpec[] = [
  { id: "A", description: "Clearly under-dosed", days: PROGRAM_A },
  { id: "B", description: "Balanced hypertrophy", days: PROGRAM_B },
  { id: "C", description: "Excessive volume", days: PROGRAM_C },
  { id: "D", description: "Low frequency, reasonable volume", days: PROGRAM_D },
  { id: "E", description: "High frequency, controlled volume", days: PROGRAM_E },
  { id: "F1", description: "Redundant selection (coverage intact)", days: PROGRAM_F1 },
  { id: "F2", description: "Redundant selection + coverage gap", days: PROGRAM_F2 },
  { id: "G", description: "Poor progression structure (only effort/reps/load scheme expressible)", days: PROGRAM_G },
  { id: "H", description: "Strong progression structure (identical to B in ProgramStructure)", days: PROGRAM_H },
  { id: "J", description: "Consecutive-day, failure-heavy (weekday order not representable)", days: PROGRAM_J },
];

// ---------------------------------------------------------------------------
// Harness state (loaded once, read-only)
// ---------------------------------------------------------------------------
let config: GoalProfileConfig;
let referenceData: ExerciseReferenceData;
let exerciseIdByName: Map<string, string>;
let nameById: Map<string, string>;
let scopeNames: string[];

interface SummaryRow {
  program: string;
  low: number;
  high: number;
  excessive: number;
  materialFindings: number;
  strengths: number;
  attention: number;
  biggest: string;
  provisionalFit: string;
}
const summary: SummaryRow[] = [];

// EDIT 2 — after `const summary: SummaryRow[] = [];` add:
interface AxisSnap { metric: string; band: string; severity: string; leverage: string }
interface Snapshot {
  volume: Map<string, AxisSnap>;
  frequency: Map<string, { value: string; band: string }>;
  program: Map<string, AxisSnap>; // ESB / PS / RC by axis type
  biggest: string;
  fit: string;
}
const snapshots = new Map<string, Snapshot>();
const PROGRAM_AXES = ["EXERCISE_SELECTION_BALANCE", "PROGRESSION_SOUNDNESS", "RECOVERY_COST"] as const;


function buildStructure(
  days: readonly DaySpec[],
  loadMode: "rpe" | "pct" = "rpe",
  pct = 0.75,
): ProgramStructure {
  const ordered = [...days].sort((a, b) => a.day - b.day);
  return {
    workoutDays: ordered.map((d, dayIndex) => ({
      id: `day-${d.day}`,
      orderIndex: dayIndex,
      name: `Day ${DAY_NAMES[d.day] ?? String(d.day)}`,
      prescriptions: d.rows.map((row, rowIndex) => {
        const seedName = assertDefined(SHORTHAND_TO_SEED[row.ex], `seed name for ${row.ex}`);
        const exerciseId = assertDefined(exerciseIdByName.get(seedName), `exercise id for ${seedName}`);
        const loadScheme: LoadScheme =
          loadMode === "pct"
            ? { type: "PERCENT_1RM", percent: pct }
            : row.rir === null
              ? { type: "FIXED_WEIGHT", weight: 50, unit: "kg" }
              : { type: "RPE_BASED", rpe: 10 - row.rir };
        return {
          id: `day-${d.day}-rx${rowIndex}`,
          orderIndex: rowIndex,
          exerciseId,
          targetSets: row.sets,
          targetRepsLow: row.reps[0],
          targetRepsHigh: row.reps[1],
          ...(row.rir === null ? {} : { targetRpe: 10 - row.rir }),
          loadScheme,
        };
      }),
    })),
  };
}

interface Evaluated {
  readonly analysis: Analysis;
  readonly result: AssessmentResult;
  readonly gatedFit: FitScoreResult;
  readonly provisionalFit: string;
  readonly complete: boolean;
}

function evaluate(structure: ProgramStructure): Evaluated {
  const analysis = computeAnalysis(structure, referenceData, config, { now: FIXED_NOW });
  const result = computeAssessment(analysis, config, { goalId: GOAL_ID });
  const complete = result.assessment.allAssessedAxes.length === analysis.axisResults.length;
  // The REAL Fit result is UNVALIDATED while validated:false. To see the band the projection WOULD give,
  // wrap the inner assessment as VALIDATED. PROVISIONAL: never user-visible.
  const gatedFit = computeFitScore(result);
  const provisional = complete
    ? computeFitScore({ kind: "VALIDATED", assessment: result.assessment })
    : null;
  const provisionalFit =
    provisional === null
      ? "BLOCKED (roll-up incomplete)"
      : provisional.kind === "VALIDATED"
        ? provisional.fitScore.band
        : "UNVALIDATED";
  return { analysis, result, gatedFit, provisionalFit, complete };
}

function named(text: string): string {
  let out = text;
  for (const [id, name] of nameById) out = out.split(id).join(name);
  return out;
}
function axisLabel(a: { axisType: string; scopeKey: string | null }): string {
  if (a.scopeKey === null) return a.axisType;
  return `${a.axisType}:${nameById.get(a.scopeKey) ?? a.scopeKey}`;
}
function fmt(v: number | string): string {
  return typeof v === "number" ? String(Number(v.toFixed(3))) : v;
}

function report(label: string, description: string, ev: Evaluated): void {
  const a = ev.result.assessment;
  const L: string[] = [];
  const axes = (t: string) => a.allAssessedAxes.filter((x) => x.axisType === t);
  const byLabel = (x: AssessedAxis, y: AssessedAxis) => axisLabel(x).localeCompare(axisLabel(y));
  const material = a.allAssessedAxes.filter((x) => LEVERAGE_RANK[x.leverage] >= LEVERAGE_RANK.LOW);

  L.push(`\n=== Program ${label}: ${description} ===`);
  L.push(
    `kind=${ev.result.kind}  thresholdsValidated=${a.thresholdsValidated}  rollUpComplete=${ev.complete}  gatedFit=${ev.gatedFit.kind}`,
  );
  if (ev.result.kind === "UNVALIDATED") L.push(`reason: ${named(ev.result.reason)}`);
  L.push("VOLUME   (fractional sets/wk | band | severity | leverage)");
  for (const x of [...axes("VOLUME")].sort(byLabel)) {
    L.push(
      `  ${axisLabel(x).padEnd(22)} ${fmt(x.metricValue).padStart(6)}  ${x.status.band.padEnd(9)} ${x.severity.padEnd(9)} ${x.leverage}`,
    );
  }
  L.push(
    "FREQUENCY (distribution ratio | band): " +
      [...axes("FREQUENCY")]
        .sort(byLabel)
        .map((x) => `${axisLabel(x).replace("FREQUENCY:", "")} ${fmt(x.metricValue)} ${x.status.band}`)
        .join("; "),
  );
  for (const t of ["EXERCISE_SELECTION_BALANCE", "PROGRESSION_SOUNDNESS", "RECOVERY_COST"]) {
    for (const x of axes(t)) {
      L.push(
        `${t.padEnd(27)} metric=${fmt(x.metricValue)} band=${x.status.band} severity=${x.severity} weight=${x.weight} leverage=${x.leverage}`,
      );
    }
  }
  L.push(`material findings (leverage >= LOW): ${material.map((x) => `${axisLabel(x)} [${x.status.band}, ${x.severity} x ${x.weight} -> ${x.leverage}]`).join("; ") || "none"}`);
  L.push(`strengths (${a.strengths.length}): ${a.strengths.map(axisLabel).sort().join(", ") || "none"}`);
  L.push(`attention areas (${a.attentionAreas.length}): ${a.attentionAreas.map(axisLabel).join(", ") || "none"}`);
  L.push(`biggest opportunity: ${a.biggestOpportunity === null ? "null" : axisLabel(a.biggestOpportunity)}`);
  L.push(
    `actions (${a.actions.length}): ${a.actions.map((x) => `${named(x.rootCauseKey)} :: ${named(x.description)}`).join(" | ") || "none"}`,
  );
  L.push(`overallSummary: ${named(a.overallSummary)}`);
  L.push(`FIT (provisional, validated:false => real result is UNVALIDATED): ${ev.provisionalFit}`);
  console.log(L.join("\n"));

  // EDIT 3 — at the END of report(), after console.log(L.join("\n")), add:
  const nameOf = (x: AssessedAxis): string => nameById.get(x.scopeKey ?? "") ?? x.scopeKey ?? "";
  const snap: Snapshot = {
    volume: new Map(),
    frequency: new Map(),
    program: new Map(),
    biggest: a.biggestOpportunity === null ? "null" : axisLabel(a.biggestOpportunity),
    fit: ev.provisionalFit,
  };
  for (const x of axes("VOLUME"))
    snap.volume.set(nameOf(x), { metric: fmt(x.metricValue), band: x.status.band, severity: x.severity, leverage: x.leverage });
  for (const x of axes("FREQUENCY")) snap.frequency.set(nameOf(x), { value: fmt(x.metricValue), band: x.status.band });
  for (const t of PROGRAM_AXES)
    for (const x of axes(t))
      snap.program.set(t, { metric: fmt(x.metricValue), band: x.status.band, severity: x.severity, leverage: x.leverage });
  snapshots.set(label, snap);

  const vol = axes("VOLUME");
  summary.push({
    program: label,
    low: vol.filter((x) => x.status.band === "Low").length,
    high: vol.filter((x) => x.status.band === "High").length,
    excessive: vol.filter((x) => x.status.band === "Excessive").length,
    materialFindings: material.length,
    strengths: a.strengths.length,
    attention: a.attentionAreas.length,
    biggest: a.biggestOpportunity === null ? "null" : axisLabel(a.biggestOpportunity),
    provisionalFit: ev.provisionalFit,
  });
}

function assertStructural(ev: Evaluated): void {
  // The profile gate: validated:false must yield UNVALIDATED, with the provisional reason.
  expect(ev.result.kind).toBe("UNVALIDATED");
  if (ev.result.kind === "UNVALIDATED") expect(ev.result.reason).toMatch(/is not validated/);
  expect(ev.result.assessment.thresholdsValidated).toBe(false);
  expect(ev.gatedFit.kind).toBe("UNVALIDATED");
  // The roll-up must resolve every axis (no band holes, no missing severity/weight).
  expect(ev.complete).toBe(true);
  expect(ev.analysis.axisResults.filter((x) => x.status.kind !== "BAND")).toEqual([]);
  // Scope: VOLUME and FREQUENCY cover exactly the profile's goal-relevant groups.
  expect(ev.analysis.axisResults).toHaveLength(scopeNames.length * 2 + 3);
    const volNames = ev.result.assessment.allAssessedAxes
    .filter((x) => x.axisType === "VOLUME")
    .map((x) => nameById.get(x.scopeKey ?? "") ?? x.scopeKey ?? "?")
    .sort();
  expect(volNames).toEqual(scopeNames);
  
}

describe("calibration harness: real engine + real seed + HYPERTROPHY candidate config", () => {
  beforeAll(async () => {
    const definition = goalProfileRegistry.get(GOAL_PROFILE_KEY);
    config = definition.loadConfig();
    scopeNames = [...definition.relevantMuscleGroups].sort();
    referenceData = await loadExerciseReferenceData({ goalProfileKey: GOAL_PROFILE_KEY });
    nameById = new Map(referenceData.muscleGroups.map((m) => [m.id, m.name]));

    const exercises = await listExercises();
    const counts = new Map<string, number>();
    for (const e of exercises) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
    exerciseIdByName = new Map(exercises.map((e) => [e.name, e.id]));
    for (const seedName of new Set(Object.values(SHORTHAND_TO_SEED))) {
      if (!exerciseIdByName.has(seedName)) throw new Error(`Seed is missing exercise "${seedName}". Re-run db:seed.`);
      if ((counts.get(seedName) ?? 0) > 1) throw new Error(`Duplicate exercise name "${seedName}" in DB; ambiguous mapping.`);
    }
  }, 60_000);

  afterAll(() => {
    console.log("\n=== SUMMARY (provisional Fit; real Fit is UNVALIDATED while validated:false) ===");
    console.table(summary);
  });

  it("seed uses the 1.0 / 0.5 involvement convention (predictions assume it)", () => {
    const distinct = [...new Set(referenceData.involvements.map((i) => i.involvementFactor))].sort();
    console.log(`distinct involvementFactor values in reference data: ${distinct.join(", ")}`);
    expect(distinct.every((v) => v === 0.5 || v === 1)).toBe(true);
  });

  it("scoped reference data contains exactly the profile's relevantMuscleGroups", () => {
    expect(referenceData.muscleGroups.map((m) => m.name).sort()).toEqual(scopeNames);
  });

  for (const spec of PROGRAMS) {
    it(`Program ${spec.id}: ${spec.description}`, () => {
      const ev = evaluate(buildStructure(spec.days));
      report(spec.id, spec.description, ev);
      assertStructural(ev);
    });
  }

  describe("translation sanity (facts about what ProgramStructure can express)", () => {
    it("H is structurally identical to B", () => {
      expect(JSON.stringify(buildStructure(PROGRAM_H))).toBe(JSON.stringify(buildStructure(PROGRAM_B)));
    });

  // EDIT 4a — REPLACE the test "G equals B on VOLUME, FREQUENCY, ESB and PROGRESSION (only RECOVERY_COST can differ)":
    it("G equals B on VOLUME, FREQUENCY and ESB (PROGRESSION and RECOVERY_COST may differ)", () => {
      const pick = (days: readonly DaySpec[]) =>
        evaluate(buildStructure(days)).analysis.axisResults.filter(
          (x) => x.axisType !== "RECOVERY_COST" && x.axisType !== "PROGRESSION_SOUNDNESS",
        );
      expect(pick(PROGRAM_G)).toEqual(pick(PROGRAM_B));
    });


    it("is deterministic (same input, same output, fixed clock)", () => {
      const a = evaluate(buildStructure(PROGRAM_B));
      const b = evaluate(buildStructure(PROGRAM_B));
      expect(JSON.stringify(a.result)).toBe(JSON.stringify(b.result));
    });
  });

  describe("extra probes", () => {
    // Program G rewritten with a %1RM load scheme and no 1-rep prescription (reps stay 10-10).
    // percent is logged at 0.75 AND 75 because LoadScheme.percent has no stated unit and
    // recoveryCost.ts uses it raw.
    for (const pct of [0.75, 75]) {
      it(`G with PERCENT_1RM loads, percent=${pct}, no 1-rep prescription (PS false-positive check)`, () => {
        const ev = evaluate(buildStructure(PROGRAM_G, "pct", pct));
        report(`G-pct(${pct})`, "G rewritten with %1RM loads, no single", ev);
        assertStructural(ev);
        const ps = ev.result.assessment.allAssessedAxes.find((x) => x.axisType === "PROGRESSION_SOUNDNESS");
        expect(ps?.metricValue).toBeGreaterThanOrEqual(1);
        expect(ps?.status.band).toBe("Issue found");
      });
      // EDIT 5 — add as the LAST block inside the top-level describe (it needs the snapshots the earlier tests fill):
  describe("comparison against calibration-before.txt (logs only, never asserts engine output)", () => {
    const HERE = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      process.env.CALIBRATION_BEFORE_PATH,
      join(process.cwd(), "calibration-before.txt"),
      join(process.cwd(), "..", "..", "calibration-before.txt"),
      join(HERE, "calibration-before.txt"),
    ].filter((p): p is string => typeof p === "string" && p.length > 0);

    function parseBefore(text: string): Map<string, Snapshot> {
      const out = new Map<string, Snapshot>();
      let cur: Snapshot | null = null;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        const head = /^=== Program ([^:]+): /.exec(line);
        if (head !== null) {
          cur = { volume: new Map(), frequency: new Map(), program: new Map(), biggest: "?", fit: "?" };
          out.set((head[1] ?? "").trim(), cur);
          continue;
        }
        if (cur === null) continue;
        const vol = /^VOLUME:(.+?)\s+(-?[\d.]+)\s+(Low|Adequate|High|Excessive)\s+(NONE|MINOR|MODERATE|MAJOR)\s+(NONE|LOW|MODERATE|HIGH)$/.exec(line);
        if (vol !== null) {
          cur.volume.set((vol[1] ?? "").trim(), { metric: vol[2] ?? "", band: vol[3] ?? "", severity: vol[4] ?? "", leverage: vol[5] ?? "" });
          continue;
        }
        const fq = /^FREQUENCY \(.*?\): (.+)$/.exec(line);
        if (fq !== null) {
          for (const part of (fq[1] ?? "").split("; ")) {
            const m = /^(.+) (-?[\d.]+) (Low|Adequate|High)$/.exec(part.trim());
            if (m !== null) cur.frequency.set((m[1] ?? "").trim(), { value: m[2] ?? "", band: m[3] ?? "" });
          }
          continue;
        }
        const ax = /^(EXERCISE_SELECTION_BALANCE|PROGRESSION_SOUNDNESS|RECOVERY_COST)\s+metric=(\S+) band=(.+?) severity=(\S+) weight=(\S+) leverage=(\S+)$/.exec(line);
        if (ax !== null) {
          cur.program.set(ax[1] ?? "", { metric: ax[2] ?? "", band: ax[3] ?? "", severity: ax[4] ?? "", leverage: ax[6] ?? "" });
          continue;
        }
        const big = /^biggest opportunity: (.+)$/.exec(line);
        if (big !== null) { cur.biggest = big[1] ?? "?"; continue; }
        const fit = /^FIT \(.*?\): (.+)$/.exec(line);
        if (fit !== null) cur.fit = fit[1] ?? "?";
      }
      return out;
    }

    function diff(label: string, b: Snapshot, a: Snapshot): string[] {
      const L: string[] = [];
      for (const [name, av] of a.volume) {
        const bv = b.volume.get(name);
        if (bv === undefined) { L.push(`${label} VOLUME:${name}: not in before`); continue; }
        if (bv.band !== av.band) L.push(`${label} VOLUME:${name} BAND ${bv.band} -> ${av.band}`);
        else if (bv.metric !== av.metric) L.push(`${label} VOLUME:${name} value ${bv.metric} -> ${av.metric} (band ${av.band})`);
        if (bv.severity !== av.severity || bv.leverage !== av.leverage)
          L.push(`${label} VOLUME:${name} severity/leverage ${bv.severity}/${bv.leverage} -> ${av.severity}/${av.leverage}`);
      }
      for (const [name, av] of a.frequency) {
        const bv = b.frequency.get(name);
        if (bv === undefined) continue;
        // metric semantics changed (distinct days -> exposures / required), so report value AND band
        if (bv.band !== av.band) L.push(`${label} FREQUENCY:${name} BAND ${bv.band} -> ${av.band} (value ${bv.value} -> ${av.value})`);
        else if (bv.value !== av.value) L.push(`${label} FREQUENCY:${name} value ${bv.value} -> ${av.value} (band ${av.band})`);
      }
      for (const t of PROGRAM_AXES) {
        const bv = b.program.get(t); const av = a.program.get(t);
        if (bv === undefined || av === undefined) continue;
        if (bv.band !== av.band) L.push(`${label} ${t} BAND ${bv.band} -> ${av.band} (metric ${bv.metric} -> ${av.metric})`);
        else if (bv.metric !== av.metric) L.push(`${label} ${t} metric ${bv.metric} -> ${av.metric} (band ${av.band})`);
        if (bv.severity !== av.severity || bv.leverage !== av.leverage)
          L.push(`${label} ${t} severity/leverage ${bv.severity}/${bv.leverage} -> ${av.severity}/${av.leverage}`);
      }
      if (b.biggest !== a.biggest) L.push(`${label} BIGGEST OPPORTUNITY ${b.biggest} -> ${a.biggest}`);
      if (b.fit !== a.fit) L.push(`${label} FIT (provisional) ${b.fit} -> ${a.fit}`);
      return L;
    }

    it("logs, per program, which axes changed and which bands flipped", () => {
      const path = candidates.find((p) => existsSync(p));
      if (path === undefined) {
        console.log(`calibration-before.txt not found (looked in: ${candidates.join(", ")}). Set CALIBRATION_BEFORE_PATH. Skipping.`);
        return;
      }
      const before = parseBefore(readFileSync(path, "utf8"));
      const lines: string[] = [`\n=== CHANGES vs ${path} ===`];
      for (const [label, after] of snapshots) {
        const b = before.get(label);
        if (b === undefined) { lines.push(`${label}: no matching block in before file`); continue; }
        const d = diff(label, b, after);
        lines.push(...(d.length === 0 ? [`${label}: no change`] : d));
      }
      console.log(lines.join("\n"));
    });
  });
    }

    // Program J as-is. Same program as the J entry in PROGRAMS (re-reported so the probe is explicit).
    it("J as-is (consecutive-day, failure-heavy)", () => {
      const ev = evaluate(buildStructure(PROGRAM_J));
      report("J(probe)", "J as-is", ev);
      assertStructural(ev);
    });
  });
});