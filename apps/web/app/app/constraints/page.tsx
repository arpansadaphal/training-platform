// apps/web/app/app/constraints/page.tsx
//
// The persistent-constraints surface. RSC wrapper that loads the user's
// constraints and hands them to the client.
//
// SCOPE: this route lists persistent Constraints (user-scoped). It does NOT
// list TemporaryConstraints, which are scoped to a Coach conversation and
// live inside that conversation's view. The two entities have different
// lifecycles and different scopes; see 03-domain-model.md.
//
// Auth is checked here, same pattern as the Review and Coach pages — /app/*
// pages do their own auth check; there is no shared layout.

import Link from "next/link";
import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import {
  ConstraintsClient,
  type ClientConstraint,
  type ClientConstraintKind,
} from "./ConstraintsClient";
import styles from "./constraints.module.css";
import { AppNav } from "@/components/nav/AppNav";

export const dynamic = "force-dynamic";

export default async function ConstraintsPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  const rows = await caller.constraint.list();

  const initialConstraints: ClientConstraint[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind as ClientConstraintKind,
    note: r.note,
    createdAtISO: r.createdAtISO,
  }));

  return (
    <>
      <AppNav />
      <main className={styles.page}>
      <nav className={styles.nav} aria-label="Breadcrumb">
        <Link href="/app">&larr; Dashboard</Link>
      </nav>
      <header className={styles.header}>
        <h1 className={styles.heading}>Constraints</h1>
        <p className={styles.intro}>
          Durable guidance stored with your account. The Coach reads these when
          discussing your program. The deterministic analysis does not
          currently use them. Constraints you record here persist across
          programs and conversations.
        </p>
        <p className={styles.introMeta}>
          For something that applies only to a single Coach conversation, tell
          the Coach — those notes stay with the conversation, not here.
        </p>
      </header>
      <ConstraintsClient initialConstraints={initialConstraints} />
    </main>
    </>
  );
}