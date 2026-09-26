// apps/web/components/simulation/GainCostNetDisplay.tsx
//
// Renders a SimulationResult, narrowing on `kind` at the top before reading
// any branch-specific field — same discipline as AssessmentDisplay on
// AssessmentResult.kind. A caller that pre-unwraps the union would defeat the
// guarantee; the narrowing lives here, once.
//
// Three branches, three honest surfaces:
//
//   COMPUTED         → Net badge + Gain list + Cost list + What-Changed summary.
//   CANNOT_COMPUTE   → A "cannot compute against the current goal profile"
//                      message. NOT an empty Gain/Cost list — an empty list
//                      would read as "no gains / no costs", which is not the
//                      same claim. See ARCH-036.
//   INVALID_MUTATION → An error surface showing the typed error code and
//                      message. This branch is only reachable in practice if
//                      the panel posts an invalid mutation; the domain-side
//                      guard is real (applyMutation throws MutationError, and
//                      simulate catches and returns it) — this surface is the
//                      user-facing projection of that.
//
// This component is reused by Phase 8's Coach panel; per
// 16-repository-structure.md's "no shared UI package" rule, that reuse is a
// direct import from this path, not an extraction.

import type {
  AssessedAxis,
  SimulationNet,
  SimulationResult,
} from "@training/domain";
import { AxisCard } from "@/components/assessment/AxisCard";
import styles from "./simulation.module.css";

interface Props {
  result: SimulationResult;
}

function axisKey(axis: AssessedAxis): string {
  return `${axis.axisType}:${axis.scopeKey ?? ""}`;
}

/**
 * Display form for a SimulationNet value. The union's raw strings
 * ("POSITIVE", "NO_MEANINGFUL_CHANGE") are wire values, not UI text — a
 * reader should not have to translate SCREAMING_SNAKE_CASE. Exhaustive
 * switch, no default: adding a SimulationNet literal without updating this
 * function is a compile error, not a runtime surprise.
 */
function formatNet(net: SimulationNet): string {
  switch (net) {
    case "POSITIVE":
      return "Positive";
    case "NEGATIVE":
      return "Negative";
    case "MIXED":
      return "Mixed";
    case "NO_MEANINGFUL_CHANGE":
      return "No meaningful change";
  }
}

export function GainCostNetDisplay({ result }: Props) {
  // ── INVALID_MUTATION ─────────────────────────────────────────────────────
  if (result.kind === "INVALID_MUTATION") {
    return (
      <div className={styles.errorBox} role="alert">
        <h3 className={styles.errorBoxTitle}>Cannot simulate this change</h3>
        <p className={styles.errorBoxMessage}>{result.error.message}</p>
        <p className={styles.errorBoxCode}>
          Code: <code>{result.error.code}</code>
        </p>
      </div>
    );
  }

  // ── CANNOT_COMPUTE ───────────────────────────────────────────────────────
  //
  // Deliberately no empty Gain/Cost lists here — an empty list would read as
  // "there were no gains / no costs", which is a claim the engine has not
  // made. The honest state is "cannot compute", rendered as such.
  if (result.kind === "CANNOT_COMPUTE") {
    return (
      <div className={styles.cannotComputeBox}>
        <h3 className={styles.cannotComputeTitle}>
          Cannot compute Gain / Cost / Net
        </h3>
        <p className={styles.cannotComputeReason}>
          The goal profile this program is assessed against is not yet
          validated, so the assessment engine cannot classify what this change
          would gain or cost. The change itself is valid and can be applied —
          the assessment will be available once the thresholds are signed off.
        </p>
      </div>
    );
  }

  // ── COMPUTED ─────────────────────────────────────────────────────────────
  const netClass =
    result.net === "POSITIVE"
      ? styles.netPositive
      : result.net === "NEGATIVE"
        ? styles.netNegative
        : result.net === "MIXED"
          ? styles.netMixed
          : styles.netNoChange;

  const wc = result.whatChanged;

  return (
    <div className={styles.wrapper}>
      <div className={`${styles.netBadge} ${netClass}`}>
        <span className={styles.netBadgeLabel}>Net</span>
        <span className={styles.netBadgeValue}>{formatNet(result.net)}</span>
      </div>

      {!wc.meaningful ? (
        <p className={styles.noChangeNote}>
          No meaningful change to your assessment.
        </p>
      ) : null}

      {result.gain.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Gain</h3>
          <div className={styles.axisList}>
            {result.gain.map((axis) => (
              <AxisCard key={axisKey(axis)} axis={axis} variant="strength" />
            ))}
          </div>
        </section>
      ) : null}

      {result.cost.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Cost</h3>
          <div className={styles.axisList}>
            {result.cost.map((axis) => (
              <AxisCard key={axisKey(axis)} axis={axis} variant="attention" />
            ))}
          </div>
        </section>
      ) : null}

      {wc.overallBandShift ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Fit Score change</h3>
          <p className={styles.bandShift}>
            <span className={styles.bandFrom}>{wc.overallBandShift.from}</span>
            {" → "}
            <span className={styles.bandTo}>{wc.overallBandShift.to}</span>
          </p>
        </section>
      ) : null}

      {wc.statusTransitions.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Status transitions</h3>
          <ul className={styles.transitionList}>
            {wc.statusTransitions.map((t) => (
              <li key={t.axisKey} className={styles.transitionItem}>
                <code>{t.axisKey}</code>: {t.from} → {t.to}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {wc.membershipChanges.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Membership changes</h3>
          <ul className={styles.transitionList}>
            {wc.membershipChanges.map((m, i) => (
              <li key={`${m.set}:${m.axisKey}:${m.change}:${i}`} className={styles.transitionItem}>
                <code>{m.axisKey}</code> {m.change === "ADDED" ? "entered" : "left"}{" "}
                {m.set.toLowerCase().replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {wc.tradeOffs.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionHeading}>Trade-offs</h3>
          <ul className={styles.transitionList}>
            {wc.tradeOffs.map((t, i) => (
              <li key={`${t.improved}:${t.worsened}:${i}`} className={styles.transitionItem}>
                <code>{t.improved}</code> improved,{" "}
                <code>{t.worsened}</code> worsened
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}