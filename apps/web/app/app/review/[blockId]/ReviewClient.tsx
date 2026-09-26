// apps/web/app/app/review/[blockId]/ReviewClient.tsx
//
// The Review screen's interactive surface.
//
// Structure (top to bottom):
//   1. Header — block status, still-in-progress banner if ACTIVE.
//   2. Assessment at commit time (ARCH-015 default — the persisted COMMIT
//      snapshot, rendered via AssessmentDisplay).
//   3. Adherence — planned vs completed, systematic deviations.
//   4. Observations — block-scoped and session-scoped, in chronological order.
//   5. OPT-IN recompute — collapsed by default; a live engine pass using the
//      current (unvalidated) goal-profile config, rendered under an explicit
//      "this is not what you saw at commit time" banner.
//
// HONESTY: no AI narrative anywhere on this screen (Final Freeze §19).
// Adherence numbers and deviations are pure aggregations of what the user
// logged; the assessment is the deterministic engine's output.

"use client";

import { useState } from "react";
import type {
  AssessmentResult,
  FitScoreResult,
} from "@training/domain";
import { AssessmentDisplay } from "@/components/assessment/AssessmentDisplay";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import styles from "./review.module.css";

// ── Client types ─────────────────────────────────────────────────────────

export type DeviationKind =
  | "REPS_BELOW"
  | "REPS_ABOVE"
  | "LOAD_BELOW"
  | "LOAD_ABOVE"
  | "SETS_SKIPPED";

export interface ClientDeviationSummary {
  exerciseId: string;
  exerciseName: string;
  kind: DeviationKind;
  occurrences: number;
  totalSetsForExercise: number;
  example: {
    sessionId: string;
    prescriptionId: string;
    prescribed: string;
    actual: string;
  };
}

export interface ClientReviewData {
  trainingBlockId: string;
  isPartial: boolean;
  snapshot: {
    reason: string;
    engineVersion: string;
    thresholdsVersion: string;
    computedAtIso: string;
    /** Json column — actually an AssessmentResult; cast when rendering. */
    assessment: unknown;
    /** Json column — actually a FitScoreResult; cast when rendering. */
    fitScore: unknown;
  };
  adherence: {
    plannedSessions: number;
    completedSessions: number;
    systematicDeviations: ClientDeviationSummary[];
  };
  observations: Array<{
    id: string;
    content: string;
    createdAtIso: string;
  }>;
}

interface Props {
  data: ClientReviewData;
}

// ── Entry point (TRPCProvider boundary) ──────────────────────────────────

export function ReviewClient(props: Props) {
  return (
    <TRPCProvider>
      <ReviewClientInner {...props} />
    </TRPCProvider>
  );
}

// ── Inner ────────────────────────────────────────────────────────────────

function ReviewClientInner({ data }: Props) {
  const [showRecompute, setShowRecompute] = useState(false);

  // Opt-in. `enabled: showRecompute` means this query fires only when the
  // user clicks the button — nothing is fetched on mount.
  const recomputeQuery = trpc.review.recomputeAssessment.useQuery(
    { trainingBlockId: data.trainingBlockId },
    {
      enabled: showRecompute,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
    },
  );

  const { plannedSessions, completedSessions, systematicDeviations } =
    data.adherence;

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.heading}>Review</h1>
        <p className={styles.muted}>
          {data.isPartial
            ? "This block is still in progress — showing data so far."
            : "This block is complete."}
        </p>
      </header>

      {data.isPartial ? (
        <p className={styles.partialBanner}>
          You can come back and review again at any time as the block
          continues.
        </p>
      ) : null}

      {/* ── 1. Assessment at commit time (ARCH-015 default) ───────────── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionHeading}>Assessment at commit time</h2>
          <p className={styles.sectionMeta}>
            {new Date(data.snapshot.computedAtIso).toLocaleDateString(
              undefined,
              { year: "numeric", month: "short", day: "numeric" },
            )}
            {" · engine "}
            <code>{data.snapshot.engineVersion}</code>
            {" · thresholds "}
            <code>{data.snapshot.thresholdsVersion}</code>
          </p>
        </div>
        <p className={styles.sectionSub}>
          What you saw when you started this block. Not recomputed.
        </p>
        <AssessmentDisplay
          result={data.snapshot.assessment as AssessmentResult}
          fitScore={data.snapshot.fitScore as FitScoreResult}
        />
      </section>

      {/* ── 2. Adherence ─────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Adherence</h2>
        <div className={styles.adherenceGrid}>
          <AdherenceStat
            label="Planned so far"
            value={plannedSessions}
          />
          <AdherenceStat
            label="Completed"
            value={completedSessions}
            highlight={
              plannedSessions > 0 && completedSessions >= plannedSessions
            }
          />
        </div>

        {systematicDeviations.length === 0 ? (
          <p className={styles.muted}>
            No systematic deviations from the plan detected.
          </p>
        ) : (
          <>
            <h3 className={styles.subHeading}>Systematic deviations</h3>
            <p className={styles.sectionSub}>
              Repeat patterns, not one-offs. Deviations are stored exactly as
              logged; the engine does not reconcile them against the plan.
            </p>
            <ul className={styles.deviationList}>
              {systematicDeviations.map((d) => (
                <li
                  key={`${d.exerciseId}:${d.kind}`}
                  className={styles.deviationItem}
                >
                  <div className={styles.deviationHead}>
                    <span className={styles.deviationExercise}>
                      {d.exerciseName}
                    </span>
                    <span className={styles.deviationBadge}>
                      {formatKind(d.kind)}
                    </span>
                  </div>
                  <p className={styles.deviationDetail}>
                    {d.occurrences} of {d.totalSetsForExercise} sets
                  </p>
                  <p className={styles.deviationExample}>
                    Plan: <code>{d.example.prescribed}</code> · Logged:{" "}
                    <code>{d.example.actual}</code>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── 3. Observations ──────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Observations</h2>
        {data.observations.length === 0 ? (
          <p className={styles.muted}>
            No observations recorded during this block.
          </p>
        ) : (
          <ul className={styles.observationList}>
            {data.observations.map((o) => (
              <li key={o.id} className={styles.observationItem}>
                <p className={styles.observationMeta}>
                  {new Date(o.createdAtIso).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className={styles.observationContent}>{o.content}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 4. Opt-in recompute (visually distinct, below divider) ───── */}
      <div className={styles.divider} role="separator" />

      <section className={styles.recomputeSection}>
        <h2 className={styles.recomputeHeading}>
          Recompute with current thresholds
        </h2>
        <p className={styles.recomputeBody}>
          Runs a fresh engine pass over this block&apos;s structure using the
          current goal-profile config. The current config is not yet validated
          (thresholds pending sign-off), so the result is a preview, not a
          recommendation. Nothing is saved.
        </p>

        {!showRecompute ? (
          <button
            type="button"
            className={styles.recomputeButton}
            onClick={() => setShowRecompute(true)}
          >
            Show recompute
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.recomputeHideButton}
              onClick={() => setShowRecompute(false)}
            >
              Hide
            </button>

            {recomputeQuery.isLoading ? (
              <p className={styles.muted}>Recomputing…</p>
            ) : null}

            {recomputeQuery.isError ? (
              <p className={styles.recomputeError}>
                Recompute failed: {recomputeQuery.error.message}
              </p>
            ) : null}

            {recomputeQuery.data ? (
              <>
                <p className={styles.recomputeWarning}>
                  This is a live recompute using current thresholds. It may
                  differ from what you saw at commit time and is not what you
                  are training against.
                </p>
                <AssessmentDisplay
                  result={recomputeQuery.data.assessment}
                  fitScore={recomputeQuery.data.fitScore}
                />
              </>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function AdherenceStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`${styles.adherenceStat} ${
        highlight ? styles.adherenceStatHighlight : ""
      }`}
    >
      <span className={styles.adherenceValue}>{value}</span>
      <span className={styles.adherenceLabel}>{label}</span>
    </div>
  );
}

function formatKind(kind: DeviationKind): string {
  switch (kind) {
    case "REPS_BELOW":
      return "Reps below plan";
    case "REPS_ABOVE":
      return "Reps above plan";
    case "LOAD_BELOW":
      return "Load below plan";
    case "LOAD_ABOVE":
      return "Load above plan";
    case "SETS_SKIPPED":
      return "Sets skipped";
  }
}