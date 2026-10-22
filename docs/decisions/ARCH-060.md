# ARCH-060 — User-scheduled training reminders and an opt-in weekly progress summary

**Date:** 2026-10-22
**Status:** Proposed. Not in effect; awaiting the founder's decision. If rejected, mark it Rejected here rather than deleting it.
**Amends (if accepted):** the notifications section of `12-mobile-strategy.md` ("no streaks, no re-engagement nudges"; anticipation cues as the only notification-worthy content), as derived from Final Freeze §26
**Supersedes:** none

## Context

The lazy-lifter diagnostic found that the commonest way a novice stops is to miss a week and never return. The current rule allows only anticipation cues. That rule correctly targets manipulative mechanics, but it also rules out a reminder the user explicitly asks for.

## Proposal

**Allowed, and always opt-in:**
1. **Reminders the user schedules themselves**, for their own training days and times ("Mondays and Thursdays at 6pm"). Off by default.
2. **A weekly progress summary**, made only of facts from the user's own logs: sessions done, PRs, and what's next. Off by default.

**Still forbidden:**
- streaks;
- guilt or loss-aversion copy ("don't lose your progress!");
- unsolicited re-engagement pushes ("we miss you");
- login-count mechanics;
- any notification the user didn't turn on.

## Why

A reminder the user configures is a tool they asked for, not a nudge the product imposes. The Freeze's concern, using the hero mechanic to drive app opens rather than training, is preserved by the forbidden list.

## Consequences (if accepted)

- The notifications line in `12-mobile-strategy.md` is read with this exception. It applies to web email, a home-screen web app, and a future Expo app alike.
- Every reminder carries a one-tap "stop these" link.
