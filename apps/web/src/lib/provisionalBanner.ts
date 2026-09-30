
// apps/web/src/lib/provisionalBanner.ts
//
// The single source of truth for "should the provisional-thresholds banner
// be shown?" (ARCH-046).
//
// The banner is a property of the CONFIGURATION, not of any individual
// assessment. If a profile is `validated: false`, every assessment produced
// from it is provisional and the banner must be visible wherever that
// assessment is rendered.
//
// The hook reads HYPERTROPHY_CONFIG directly from @training/domain rather
// than inspecting an Assessment payload, because the config is the source
// of truth for `validated` — an AssessmentSnapshot's `thresholdsValidated`
// field is a copy of this fact taken at commit time, and the config is
// what answers the question now.
//
// At MVP this hook returns `true` unconditionally: HYPERTROPHY_CONFIG is
// `validated: false`. The day a validated config ships, this hook returns
// `false` and the banner disappears from every surface at once — that is
// the intended expiration of ARCH-046.
//
// Named as a hook (per ARCH-046's Consequence section, which specifies
// `useProvisionalBanner()`) because callers consume it as one. In practice
// it is a synchronous read of a static config constant: no state, no
// subscription, no re-render trigger beyond the constant's own value.

import { HYPERTROPHY_CONFIG } from "@training/domain";

export function useProvisionalBanner(): boolean {
  // `!== true` rather than `=== false`: an absent or malformed flag is
  // treated as "not validated", which is the honest default for a field
  // whose whole purpose is to gate a disclaimer.
  return HYPERTROPHY_CONFIG.validated !== true;
}