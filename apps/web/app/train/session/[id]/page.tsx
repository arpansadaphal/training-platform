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

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: PageProps) {
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

  const [exercises, records, observations] = await Promise.all([
    caller.exercise.listAll(),
    caller.performance.listForSession({ sessionId: id }),
    caller.observation.listForSession({ sessionId: id }),
  ]);

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/train">&larr; Training</Link>
      </nav>
      <SessionClient
        context={context}
        exercises={exercises}
        initialRecords={records}
        initialObservations={observations}
      />
    </main>
  );
}