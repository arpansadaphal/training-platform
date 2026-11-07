// packages/domain/src/copy/provisionalBanner.ts
//
// ARCH-065 / D3. The provisional-thresholds banner, in the words a lifter reads. It replaces "Thresholds are
// evidence-graded, not human-validated. Tier 1 rests on meta-analyses and trials; Tier 4 is engine-derived.", which said
// the same thing in vocabulary a stranger cannot use. The fact is unchanged (ARCH-046 / ARCH-054): the thresholds are
// graded by how strong their evidence is, and no expert has signed the profile off. The banner stays inside
// AssessmentDisplay, non-dismissable; the tier-by-tier detail is one click away under "See evidence". It never says
// "validated" in the positive. The copy is a domain constant so it goes through the forbidden-copy lint.

export const PROVISIONAL_BANNER_LEAD = "Provisional:";
export const PROVISIONAL_BANNER_BODY =
  "thresholds come from published research and coaching practice, graded by strength of evidence; no expert has signed them off yet.";
