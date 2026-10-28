// Re-run with muscle groups in production order (name asc) and print only the headline a user sees.
import { REF } from "./lib";
REF.muscleGroups.sort((a, b) => a.name.localeCompare(b.name));
const origLog = console.log;
const lines: string[] = [];
console.log = (s: string) => {
  for (const l of String(s).split("\n")) if (/^===|UI HEADLINE|BIGGEST/.test(l)) lines.push(l);
};
await import("./set1");
await import("./set2");
await import("./set3");
console.log = origLog;
console.log(lines.join("\n"));
