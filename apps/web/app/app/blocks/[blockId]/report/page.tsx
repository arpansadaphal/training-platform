// Server component for the Block Report (Phase 10b).
//
// Fetches via appRouter.createCaller (matching the Review page), serializes
// Date fields to ISO strings, and hands the result to BlockReportClient.
//
// Two outcomes on the same route:
//   - kind: "REPORT"  → BlockReportClient
//   - kind: "ACTIVE"  → in-progress fallback with a link to Review
//
// A non-owner or nonexistent block arrives as NOT_FOUND from the service;
// translated to Next's notFound().

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import {
  BlockReportClient,
  type ClientBlockReportData,
} from "./BlockReportClient";
import styles from "./blockReport.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ blockId: string }>;
}

export default async function BlockReportPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }
  const { blockId } = await params;

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  let result;
  try {
    result = await caller.blockReport.get({ blockId });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  if (result.kind === "ACTIVE") {
    return (
      <div className={styles.fallback}>
        <h1 className={styles.fallbackTitle}>
          This block is still in progress
        </h1>
        <p className={styles.fallbackBody}>
          A Block Report is written for a completed block. Your current
          block is best viewed in Review.
        </p>
        <Link
          href={`/app/review/${result.blockId}`}
          className={styles.fallbackLink}
        >
          See Review
        </Link>
      </div>
    );
  }

  const report = result.report;
  const clientReport: ClientBlockReportData = {
    blockId: report.blockId,
    programId: report.programId,
    programName: report.programName,
    versionNumber: report.versionNumber,
    status: report.status,
    startedAtIso: report.startedAt.toISOString(),
    endedAtIso: report.endedAt ? report.endedAt.toISOString() : null,
    snapshot: {
      reason: report.assessmentSnapshot.reason,
      engineVersion: report.assessmentSnapshot.engineVersion,
      thresholdsVersion: report.assessmentSnapshot.thresholdsVersion,
      computedAtIso: report.assessmentSnapshot.computedAt.toISOString(),
      assessment: report.assessmentSnapshot.assessment,
      fitScore: report.assessmentSnapshot.fitScore,
    },
    execution: {
      sessionsCompleted: report.execution.sessionsCompleted,
      totalSetsLogged: report.execution.totalSetsLogged,
      systematicDeviations: report.execution.systematicDeviations.map((d) => ({
        exerciseId: d.exerciseId,
        exerciseName: d.exerciseName,
        kind: d.kind,
        occurrences: d.occurrences,
      })),
    },
    observations: report.observations.map((o) => ({
      id: o.id,
      content: o.content,
      createdAtIso: o.createdAt.toISOString(),
    })),
    previousBlock: report.previousBlock
      ? {
          blockId: report.previousBlock.blockId,
          startedAtIso: report.previousBlock.startedAt.toISOString(),
          endedAtIso: report.previousBlock.endedAt
            ? report.previousBlock.endedAt.toISOString()
            : null,
        }
      : null,
    narrative: report.narrative,
  };

  return <BlockReportClient report={clientReport} />;
}