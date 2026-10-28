# coach-parity harness

Runs the real engine against 25 test programs; used to compare against a coach's expected headline. Referenced by the audit report and by ARCH-063.

- `lib.ts`: loads the seed's exercises and involvement factors in memory (no database), builds a `ProgramStructure` from a small row DSL and prints what the UI would say (`computeAnalysis` -> `computeAssessment` -> `provisionalFitBand` -> `axisSentence`).
- `set1.ts`: calibration programs A-J (effort as the calibration harness has it).
- `set2.ts`: nine common programs (PPL, upper/lower, full body, bro split, Starting Strength, 5/3/1, beginner, home dumbbell).
- `set3.ts`: three personas.
- `probes.ts`: the same PPL entered as 3 days and as 6 days.
- `prodorder.ts`: re-runs everything with muscle groups in production order (name ascending) and prints only the headlines.

Run: `pnpm coach-parity` (from the repo root). Output is for reading, not asserting. The expected-headline comparison lands in ARCH-063 / Session B.
