// packages/domain/src/analysis/__fixtures__/programStructures.ts
//
// Hand-built ProgramStructure fixtures. Deterministic and self-contained —
// no database.

import type {
  ExercisePrescriptionStructure,
  LoadScheme,
  ProgramStructure,
} from "../../types";

interface PrescriptionInput {
  id: string;
  exerciseId: string;
  targetSets: number;
  loadScheme: LoadScheme;
  targetRepsLow?: number;
  targetRepsHigh?: number;
  targetRpe?: number;
}

function makeDay(
  dayId: string,
  orderIndex: number,
  name: string,
  prescriptions: PrescriptionInput[],
): ProgramStructure["workoutDays"][number] {
  return {
    id: dayId,
    orderIndex,
    name,
    prescriptions: prescriptions.map<ExercisePrescriptionStructure>((p, i) => ({
      id: p.id,
      orderIndex: i,
      exerciseId: p.exerciseId,
      targetSets: p.targetSets,
      targetRepsLow: p.targetRepsLow ?? 8,
      targetRepsHigh: p.targetRepsHigh ?? 12,
      targetRpe: p.targetRpe,
      loadScheme: p.loadScheme,
    })),
  };
}

/** Small, well-covering program: one day, one prescription per pattern. */
export const fullyCoveredProgram: ProgramStructure = {
  workoutDays: [
    makeDay("d1", 0, "Full Body", [
      { id: "p1", exerciseId: "squat", targetSets: 3, loadScheme: { type: "RPE_BASED", rpe: 8 } },
      { id: "p2", exerciseId: "deadlift", targetSets: 3, loadScheme: { type: "RPE_BASED", rpe: 8 } },
      { id: "p3", exerciseId: "bench", targetSets: 3, loadScheme: { type: "RPE_BASED", rpe: 8 } },
      { id: "p4", exerciseId: "ohp", targetSets: 3, loadScheme: { type: "RPE_BASED", rpe: 8 } },
      { id: "p5", exerciseId: "row", targetSets: 3, loadScheme: { type: "RPE_BASED", rpe: 8 } },
      { id: "p6", exerciseId: "pullup", targetSets: 3, loadScheme: { type: "BODYWEIGHT" } },
      { id: "p7", exerciseId: "farmer", targetSets: 3, loadScheme: { type: "FIXED_WEIGHT", weight: 30, unit: "kg" } },
      { id: "p8", exerciseId: "curl", targetSets: 3, loadScheme: { type: "RPE_BASED", rpe: 8 } },
    ]),
  ],
};

/** Program with a clear pattern gap: no HINGE, no CARRY. */
export const programWithGaps: ProgramStructure = {
  workoutDays: [
    makeDay("d1", 0, "Upper", [
      { id: "p1", exerciseId: "bench", targetSets: 4, loadScheme: { type: "RPE_BASED", rpe: 8 } },
      { id: "p2", exerciseId: "ohp", targetSets: 3, loadScheme: { type: "RPE_BASED", rpe: 8 } },
      { id: "p3", exerciseId: "row", targetSets: 4, loadScheme: { type: "RPE_BASED", rpe: 8 } },
      { id: "p4", exerciseId: "pullup", targetSets: 4, loadScheme: { type: "BODYWEIGHT" } },
    ]),
    makeDay("d2", 1, "Lower", [
      { id: "p1", exerciseId: "squat", targetSets: 4, loadScheme: { type: "RPE_BASED", rpe: 8 } },
      { id: "p2", exerciseId: "curl", targetSets: 3, loadScheme: { type: "RPE_BASED", rpe: 8 } },
    ]),
  ],
};

/** Program using PERCENT_1RM with NO single anywhere -> progression issue. */
export const programWithProgressionIssue: ProgramStructure = {
  workoutDays: [
    makeDay("d1", 0, "Squat Day", [
      { id: "p1", exerciseId: "squat", targetSets: 5, loadScheme: { type: "PERCENT_1RM", percent: 0.8 } },
    ]),
  ],
};

/** Program using PERCENT_1RM AND containing a single -> no progression issue. */
export const programWithPercentOneRmAndSingle: ProgramStructure = {
  workoutDays: [
    makeDay("d1", 0, "Squat Day", [
      {
        id: "p1",
        exerciseId: "squat",
        targetSets: 5,
        loadScheme: { type: "PERCENT_1RM", percent: 0.8 },
        targetRepsLow: 1,
        targetRepsHigh: 1,
      },
    ]),
  ],
};

/** Empty program: zero workout days. */
export const emptyProgram: ProgramStructure = {
  workoutDays: [],
};

/** Hand-built program used by the dev script; larger than the fixture set. */
export const devScriptProgram: ProgramStructure = fullyCoveredProgram;