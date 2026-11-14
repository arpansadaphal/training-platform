// How a cue is grouped under Setup / Action / Feel and which words go bold (apps/web/src/lib/cueText.ts). Lives in
// the domain package with the other cue tests; the web file is loaded by path (outside this package's tsc rootDir).
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type CueKind = "setup" | "action" | "feel";
interface CueStep {
  kind: CueKind;
  text: string;
}
interface CueTextModule {
  groupCues(steps: readonly CueStep[]): { kind: CueKind; label: string; lines: string[] }[];
  boldActionVerbs(text: string): { text: string; bold: boolean }[];
}
const { groupCues, boldActionVerbs } = (await import(
  /* @vite-ignore */ resolve(__dirname, "../../../../../apps/web/src/lib/cueText")
)) as CueTextModule;

const bolds = (text: string) =>
  boldActionVerbs(text)
    .filter((s) => s.bold)
    .map((s) => s.text);

describe("boldActionVerbs", () => {
  it("bolds the drive verbs and keeps every other character in place", () => {
    const line = "Drive your elbows down toward your hips, chest lifted to meet the bar.";
    expect(bolds(line)).toEqual(["Drive", "meet"]);
    expect(
      boldActionVerbs(line)
        .map((s) => s.text)
        .join(""),
    ).toBe(line);
  });

  it.each([
    ["Lead with your elbows, push the dumbbells out toward the walls.", ["Lead with", "push"]],
    ["Squeeze your glutes and brace your abs, then hold.", ["Squeeze", "brace"]],
    ["Pin your shoulder blades, plant your feet, lock your knees.", ["Pin", "plant", "lock"]],
    ["Stack your ribs over your hips and reach forward.", ["Stack", "reach"]],
    ["Press the bar up, then pull it back.", ["Press", "pull"]],
  ])("%s", (line, expected) => {
    expect(bolds(line)).toEqual(expected);
  });

  it("leaves hyphenated names and other forms of the word alone", () => {
    expect(bolds("Do a push-up, then a pull-through.")).toEqual([]);
    expect(bolds("Pressing and pulling are not the verbs; a bench press is a name.")).toEqual([
      "press",
    ]);
    expect(bolds("Keep your chest proud.")).toEqual([]);
  });

  it("returns one plain run for a line with no verb", () => {
    expect(boldActionVerbs("Feel your quads.")).toEqual([
      { text: "Feel your quads.", bold: false },
    ]);
  });
});

describe("groupCues", () => {
  it("labels a written cue Setup, Action, Feel", () => {
    const groups = groupCues([
      { kind: "setup", text: "a" },
      { kind: "action", text: "b" },
      { kind: "feel", text: "c" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Setup", "Action", "Feel"]);
    expect(groups.map((g) => g.lines)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("puts a draft's action lines under one Action label", () => {
    const groups = groupCues([
      { kind: "action", text: "a" },
      { kind: "action", text: "b" },
      { kind: "action", text: "c" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: "Action", lines: ["a", "b", "c"] });
  });

  it("is empty for no cues", () => {
    expect(groupCues([])).toEqual([]);
  });
});
