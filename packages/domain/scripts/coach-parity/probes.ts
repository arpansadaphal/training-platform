import { run, REF } from "./lib";
import { PROBE_PROGRAMS } from "./programs";
REF.muscleGroups.sort((a, b) => a.name.localeCompare(b.name));
for (const { program, defaultRpe } of PROBE_PROGRAMS) run(program, { defaultRpe });
