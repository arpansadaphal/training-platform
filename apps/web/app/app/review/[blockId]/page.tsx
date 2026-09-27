// apps/web/app/app/review/[blockId]/page.tsx
//
// The Review screen's RSC wrapper. Fetches review.get, converts the returned
// ReviewData (with Date fields) into a ClientReviewData (with strings and
// pre-serialized unions) so the client component below never touches a Date.
//
// ARCH-015: the default view is the COMMIT-time AssessmentSnapshot — the
// assessment the user actually saw when they committed to this block. The
// opt-in "recompute with current thresholds" is a separate, live engine pass
// (never persisted) rendered below with an explicit warning. The two views
// are never blended.
//
// The Coach panel is rendered beside the review body, scoped to a
// conversation tied to this block's program version. The RSC resolves the
// conversation id server-side (via coach.openConversationForBlock) so the
// panel appears on first paint with no flicker.
//
// /app/* pages do their own auth check; there is no shared layout.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { CoachPanel } from "@/src/components/coach/CoachPanel";
import { ReviewClient, type ClientReviewData } from "./ReviewClient";
import styles from "./review.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ blockId: string }>;
}

export default async function ReviewPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }
  const { blockId } = await params;

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  let review;
  try {
    review = await caller.review.get({ trainingBlockId: blockId });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  // Get-or-create the Coach conversation scoped to this block's program
  // version. The panel needs a conversationId before it can render.
  const coachConversation = await caller.coach.openConversationForBlock({
    trainingBlockId: blockId,
  });

  // Convert to the client-serializable shape. Dates become ISO strings;
  // Json columns (assessment, fitScore) stay as unknown and are cast inside
  // the client when passing to AssessmentDisplay.
  const clientData: ClientReviewData = {
    trainingBlockId: review.trainingBlockId,
    isPartial: review.isPartial,
    snapshot: {
      reason: review.assessmentSnapshot.reason,
      engineVersion: review.assessmentSnapshot.engineVersion,
      thresholdsVersion: review.assessmentSnapshot.thresholdsVersion,
      computedAtIso: review.assessmentSnapshot.computedAt.toISOString(),
      assessment: review.assessmentSnapshot.assessment,
      fitScore: review.assessmentSnapshot.fitScore,
    },
    adherence: {
      plannedSessions: review.adherence.plannedSessions,
      completedSessions: review.adherence.completedSessions,
      systematicDeviations: review.adherence.systematicDeviations.map((d) => ({
        exerciseId: d.exerciseId,
        exerciseName: d.exerciseName,
        kind: d.kind,
        occurrences: d.occurrences,
        totalSetsForExercise: d.totalSetsForExercise,
        example: d.example,
      })),
    },
    observations: review.observations.map((o) => ({
      id: o.id,
      content: o.content,
      createdAtIso: o.createdAt.toISOString(),
    })),
  };

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/app">&larr; Dashboard</Link>
      </nav>
      <div className={styles.layout}>
        <div className={styles.reviewColumn}>
          <ReviewClient data={clientData} />
        </div>
        <aside className={styles.coachColumn}>
          <CoachPanel
            conversationId={coachConversation.id}
            contextLabel="This block's review"
          />
        </aside>
      </div>
    </main>
  );
}