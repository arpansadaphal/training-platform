// The text of /credits and the caption under a drawing. Run through the forbidden-copy lint by
// packages/domain/src/progress/__tests__/exerciseIllustrations.test.ts.
//
// "the training app" stands in for the product name until it is decided (D4).

export const CREDITS_COPY = {
  title: "Credits",
  drawingsHeading: "Exercise drawings",
  drawingsBody:
    "The exercise drawings in the training app are from Everkinetic, created by Greg Priday and contributors. They are licensed under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).",
  sourceLabel: "Everkinetic data and drawings",
  licenseLabel: "CC BY-SA 4.0 license",
  changesHeading: "What we changed",
  changesBody:
    "We rasterised each vector drawing, scaled it to fit a 480-pixel square on a white background, and saved it as a WebP file. We did not redraw or edit the drawings. Each exercise shows the two frames of one Everkinetic drawing.",
  matchingHeading: "Which drawing goes with which exercise",
  matchingBody:
    "We matched drawings to exercises by movement and equipment. Where Everkinetic has no drawing of an exercise, the exercise has none. A few drawings show a close variation; the list of those is in the repository.",
  shareAlikeHeading: "Using the converted drawings",
  shareAlikeBody:
    "The converted drawings are shared under the same license, CC BY-SA 4.0. They are the files in the exercises folder of the training app's public files, and the repository holds the mapping and the conversion script.",
  repositoryLabel: "Mapping and conversion script",
  back: "Back",
  caption: "Drawing: Everkinetic, CC BY-SA 4.0",
} as const;

export const CREDITS_LINKS = {
  source: "https://github.com/everkinetic/data",
  license: "https://creativecommons.org/licenses/by-sa/4.0/",
  repository:
    "https://github.com/arpansadaphal/training-platform/tree/main/apps/web/scripts/illustrations",
} as const;
