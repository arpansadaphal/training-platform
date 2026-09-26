// packages/domain/scripts/run-analysis.ts
//
// Developer-only QA harness. Prints the full Analysis for a hand-written
// ProgramStructure. No web route, no tRPC procedure — per the user's Q4 answer
// ("never build [a web route]; the cleanest way to honor ['removed before
// Phase 9'] is to never build it").
//
// Run with: pnpm --filter @training/domain exec tsx scripts/run-analysis.ts
// Requires `tsx` as a devDependency (added in package.json below).

import { computeAnalysis } from "../src/analysis/computeAnalysis";
import { testReferenceData } from "../src/analysis/__fixtures__/exerciseReferenceData";
import { devScriptProgram } from "../src/analysis/__fixtures__/programStructures";
import { HYPERTROPHY_CONFIG } from "../src/goal-profiles/hypertrophy";

const analysis = computeAnalysis(
  devScriptProgram,
  testReferenceData,
  HYPERTROPHY_CONFIG,
  { programVersionId: "DEV-SCRIPT" },
);

console.log("=== Analysis for devScriptProgram (HYPERTROPHY config, all bands null) ===");
console.log(`programVersionId: ${analysis.programVersionId}`);
console.log(`computedAt:       ${analysis.computedAt}`);
console.log(`axisResults:      ${analysis.axisResults.length}`);
console.log();
for (const r of analysis.axisResults) {
  const status =
    r.status.kind === "BAND"
      ? `BAND(${r.status.band})`
      : `UNVALIDATED(${r.status.reason})`;
  console.log(
    `${r.axisType.padEnd(28)} scope=${String(r.scopeKey).padEnd(12)} metric=${String(
      r.metricValue,
    ).padEnd(8)} status=${status}`,
  );
}