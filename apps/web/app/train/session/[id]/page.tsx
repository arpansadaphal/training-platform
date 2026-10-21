// apps/web/app/train/session/[id]/page.tsx
//
// The session-detail RSC. Fetches the session context (session + block +
// workout day + prescriptions + program), the exercise reference data (for
// display names), the current set log, and the session's observations, then
// hands all four to SessionClient.
//
// All reads go through appRouter.createCaller — the RSC pattern established
// in Phase 1 and used throughout Phase 4/5. No direct repository imports
// (three-layer rule).
//
// /train does its own auth check (per the Phase 6 layout finding — there is
// no shared layout under app/app/ to inherit from).

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { SessionClient } from "./SessionClient";
import styles from "../../train.module.css";
import { AppNav } from "@/components/nav/AppNav";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ autosaved?: string }>;
}

export default async function SessionDetailPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }
  const { id } = await params;

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  // getContext throws NOT_FOUND for both "session doesn't exist" and "caller
  // doesn't own the session's block" — same non-disclosure rule as the rest
  // of the API. Map to Next's notFound() so the user sees the standard 404.
  let context;
  try {
    context = await caller.session.getContext({ sessionId: id });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  // ARCH-057: sessions the start that led here auto-saved. Each is loaded
  // through getContext, so only the caller's own sessions are ever named.
  const autosavedIds = ((await searchParams).autosaved ?? "")
    .split(",")
    .filter((x) => x.length > 0)
    .slice(0, 5);
  const autoSaved = (
    await Promise.all(
      autosavedIds.map(async (sessionId) => {
        try {
          const ctx = await caller.session.getContext({ sessionId });
          if (ctx.session.status !== "COMPLETED" || !ctx.session.completedAt) return null;
          return {
            sessionId,
            dayName: ctx.workoutDay.name,
            completedAtIso: ctx.session.completedAt.toISOString(),
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  const [exercises, records, observations, lastTimeHints] = await Promise.all([
    caller.exercise.listAll(),
    caller.performance.listForSession({ sessionId: id }),
    caller.observation.listForSession({ sessionId: id }),
    caller.session.getLastTimeHints({ sessionId: id }),
  ]);

  return (
    <>
      <AppNav />
      <main className={styles.page}>
      <nav className={styles.nav} aria-label="Breadcrumb">
        <Link href="/train">&larr; Training</Link>
      </nav>
      <SessionClient
        context={context}
        exercises={exercises}
        initialRecords={records}
        initialObservations={observations}
        lastTimeHints={lastTimeHints}
        autoSaved={autoSaved}
      />
    </main>
    </>
  );
}