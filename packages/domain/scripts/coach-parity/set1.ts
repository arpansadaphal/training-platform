// Set 1: re-run the calibration programs A-L through the in-memory harness to confirm parity with
// calibration-before.txt, then print what the UI would say. Programs live in programs.ts.
import { run } from "./lib";
import { SET1_PROGRAMS } from "./programs";

for (const { program, defaultRpe } of SET1_PROGRAMS) run(program, { defaultRpe });
