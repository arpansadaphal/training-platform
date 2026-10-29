// Set 3: personas. Programs written from common patterns for each type. Programs live in programs.ts.
import { run } from "./lib";
import { SET3_PROGRAMS } from "./programs";

for (const { program, defaultRpe } of SET3_PROGRAMS) run(program, { defaultRpe });
