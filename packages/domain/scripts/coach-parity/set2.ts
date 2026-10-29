// Set 2: common programs as a stranger would enter them (Builder default effort RPE 8 unless stated).
// Programs live in programs.ts.
import { run } from "./lib";
import { SET2_PROGRAMS } from "./programs";

for (const { program, defaultRpe } of SET2_PROGRAMS) run(program, { defaultRpe });
