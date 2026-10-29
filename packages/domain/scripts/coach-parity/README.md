# coach-parity harness

Runs the real engine against 25 test programs and scores each engine headline against what a coach would say first. Referenced by the audit report and by ARCH-063.

- `programs.ts`: the 26 harness programs, defined once (the 25 scored programs plus P2-noRPE, which repeats P2 with effort left blank).
- `lib.ts`: loads the seed's exercises and involvement factors in memory (no database), builds a `ProgramStructure` from a small row DSL and prints what the UI would say (`computeAnalysis` -> `computeAssessment` -> `provisionalFitBand` -> `axisSentence`).
- `set1.ts`, `set2.ts`, `set3.ts`, `probes.ts`: print the programs (calibration A-J; nine common programs; three personas; the same PPL as 3 days and as 6). `pnpm coach-parity` runs all four and prints for reading, not asserting.
- `prodorder.ts`: re-runs set 1-3 with muscle groups in production order (name ascending) and prints only the headlines.
- `expected.ts`: the coach's first-line observation for each of the 25 scored programs, as a sentence and as `match` (`{subject, direction}` pairs, read as OR), with a `rationale` per entry. Audit-authored; awaiting real coach review.
- `matcher.ts`: compares the engine's headline with the expected `match`. Containment is one-way; `none` passes only on an empty headline.
- `parity.ts` (`pnpm coach-parity:score`): scores all 25 in production order and prints PASS/FAIL with both headlines side by side.
- `parity.test.ts`: the matcher's rules, the table's shape, and a ratchet on the exact set of passing programs. The ratchet moves only with an engine change, by a deliberate edit. Never loosen the matcher to turn a FAIL into a PASS.

None of this is part of `tsc` (domain's tsconfig includes `src` only); vitest and eslint do cover it.
