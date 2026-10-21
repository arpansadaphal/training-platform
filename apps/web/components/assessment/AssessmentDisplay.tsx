// apps/web/components/assessment/AssessmentDisplay.tsx
//
// The generic Assessment renderer, in the Final Freeze §9's fixed order:
// Overall → Strengths → Attention → Biggest Opportunity → Actions.
//
// Reused (not copied) by Phase 7's Review screen and Phase 8's Coach panel.
// Per 16-repository-structure.md's "no shared UI package" rule, those phases
// re-import this same component from apps/web; they do not extract it to a
// shared package. A future mobile app renders its own component against the
// same AssessmentResult type.
//
// The union narrowing happens here, once, at the top — the caller passes the
// raw AssessmentResult and FitScoreResult, and this component decides whether
// the assessment is renderable at all.
//
// ARCH-046: this component is also the ONLY place the provisional-
// thresholds banner is mounted. Every assessment surface in the app goes
// through here, so mounting the banner here means no surface can display
// an assessment without the disclaimer.
// scripts/check-provisional-banner.sh enforces the delegation rule
// structurally — a new component that imports AssessmentResult or
// FitScoreResult without going through this file fails CI.
//
// PHASE 10.2 (Option B): the meaning of `kind: "UNVALIDATED"` changed when
// the HYPERTROPHY config was populated. Before, UNVALIDATED meant the
// roll-up was BLOCKED — null weights, missing bands, no classification to
// show. Now, with the config populated but `validated: false`, the roll-up
// SUCCEEDS and the classification fields are populated. The UNVALIDATED
// kind now means "provisional", not "unavailable". This component renders
// the classification under the provisional banner when there is content to
// show, and falls back to the UnvalidatedState message only when the
// classification is genuinely empty (the roll-up-blocked case).
//
// PHASE A (ARCH-054): a provisional result now shows its Fit band, read via
// the domain's provisionalFitBand (the same projection computeFitScore uses,
// over the same roll-up — invariant 8), always labelled "Provisional fit".
// "See evidence" on the banner or the fit line opens the EvidencePanel. The
// engine's overallSummary string and root-cause keys are no longer shown;
// the summary is rebuilt from the same classification in plain words.

"use client";

import { useState } from "react";
import {
  isClassified,
  provisionalFitBand,
  type AssessedAxis,
  type Assessment,
  type AssessmentResult,
  type FitScoreBand,
  type FitScoreResult,
} from "@training/domain";
import { AxisCard } from "./AxisCard";
import { EvidencePanel } from "./EvidencePanel";
import { ProvisionalBanner } from "./ProvisionalBanner";
import { UnvalidatedState } from "./UnvalidatedState";
import { axisLabel, fitBandLabel } from "./labels";
import { useProvisionalBanner } from "@/src/lib/provisionalBanner";
import styles from "./assessment.module.css";

interface Props {
  result: AssessmentResult;
  fitScore: FitScoreResult;
}

function axisKey(axis: AssessedAxis): string {
  return `${axis.axisType}:${axis.scopeKey ?? ""}`;
}

/** What the Fit line shows: the real band, a provisional one, or nothing. */
type FitLine =
  | { kind: "FINAL"; band: FitScoreBand }
  | { kind: "PROVISIONAL"; band: FitScoreBand }
  | null;

function fitLineFor(result: AssessmentResult, fitScore: FitScoreResult): FitLine {
  if (fitScore.kind === "VALIDATED") return { kind: "FINAL", band: fitScore.fitScore.band };
  const provisional = provisionalFitBand(result);
  return provisional ? { kind: "PROVISIONAL", band: provisional.band } : null;
}

export function AssessmentDisplay({ result, fitScore }: Props) {
  // ARCH-046: the banner is a property of the configuration, not of any
  // one assessment. `useProvisionalBanner` reads HYPERTROPHY_CONFIG's
  // `validated` flag and returns true while it is false — which, at MVP,
  // is always. When a validated config ships, the hook returns false and
  // the banner disappears from every surface at once.
  const provisional = useProvisionalBanner();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const openEvidence = () => setEvidenceOpen(true);
  const a = result.assessment;

  const banner = provisional ? (
    <ProvisionalBanner onSeeEvidence={openEvidence} evidenceOpen={evidenceOpen} />
  ) : null;
  const panel = evidenceOpen ? <EvidencePanel onClose={() => setEvidenceOpen(false)} /> : null;

  // Genuinely blocked: UNVALIDATED and no classification content.
  // Fall back to the reason string. This is the "roll-up could not
  // classify" state — null weights, missing bands, missing severity
  // mapping. There is nothing useful to render, and no band to show.
  if (result.kind === "UNVALIDATED" && !isClassified(a)) {
    return (
      <>
        {banner}
        {panel}
        <UnvalidatedState reason={result.reason} />
      </>
    );
  }

  return (
    <article className={styles.wrapper}>
      {banner}
      {panel}
      <AssessmentBody
        a={a}
        fit={fitLineFor(result, fitScore)}
        onSeeEvidence={openEvidence}
        evidenceOpen={evidenceOpen}
      />
    </article>
  );
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function AssessmentBody({
  a,
  fit,
  onSeeEvidence,
  evidenceOpen,
}: {
  a: Assessment;
  fit: FitLine;
  onSeeEvidence: () => void;
  evidenceOpen: boolean;
}) {
  return (
    <>
      <section className={styles.overall}>
        <h2 className={styles.sectionHeading}>Overall</h2>
        {fit ? (
          fit.kind === "FINAL" ? (
            <p className={styles.fitScore}>
              Fit: <span className={styles.fitScoreBand}>{fitBandLabel(fit.band)}</span>
            </p>
          ) : (
            <p className={styles.fitScore}>
              Provisional fit:{" "}
              <span className={styles.fitScoreBand}>{fitBandLabel(fit.band)}</span> — based on
              evidence-graded thresholds.{" "}
              <button
                type="button"
                className={styles.linkButton}
                onClick={onSeeEvidence}
                aria-expanded={evidenceOpen}
              >
                See evidence
              </button>
            </p>
          )
        ) : null}
        <p className={styles.overallSummary}>
          {plural(a.strengths.length, "strength", "strengths")} ·{" "}
          {plural(a.attentionAreas.length + (a.biggestOpportunity ? 1 : 0), "thing", "things")} to
          look at
          {a.biggestOpportunity ? (
            <>
              . Biggest opportunity: <strong>{axisLabel(a.biggestOpportunity)}</strong>.
            </>
          ) : (
            "."
          )}
        </p>
      </section>

      {a.strengths.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Strengths</h2>
          <div className={styles.axisList}>
            {a.strengths.map((axis) => (
              <AxisCard key={axisKey(axis)} axis={axis} variant="strength" />
            ))}
          </div>
        </section>
      ) : null}

      {a.attentionAreas.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Attention areas</h2>
          <div className={styles.axisList}>
            {a.attentionAreas.map((axis) => (
              <AxisCard key={axisKey(axis)} axis={axis} variant="attention" />
            ))}
          </div>
        </section>
      ) : null}

      {a.biggestOpportunity ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Biggest Opportunity</h2>
          <AxisCard axis={a.biggestOpportunity} variant="opportunity" />
        </section>
      ) : null}

      {a.actions.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Actions</h2>
          <ul className={styles.actionList}>
            {a.actions.map((action) => (
              <li
                key={action.rootCauseKey}
                className={styles.actionItem}
                data-root-cause={action.rootCauseKey}
              >
                <p className={styles.actionDescription}>{action.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
