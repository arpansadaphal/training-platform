// apps/web/app/app/programs/[id]/history/page.tsx
//
// Version history for a Program — "your story" framing (Round 2 §4's
// History lobby component, already implied by the versioned model, now
// surfaced as a first-class view).
//
// Reads: the Program (ownership + notFound), its versions, and — for each
// adjacent pair — a structural diff computed on demand via
// programVersion.diff (ARCH-037; never stored). No Revision read: the
// trigger is derivable from ProgramVersion.createdVia, and Revision.userNote
// is null everywhere at MVP, so no separate revision fetch adds information.
// A later phase that starts populating userNote adds a revision read here.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@training/api";
import type { StructureDiffEntry } from "@training/domain";
import { auth } from "@/src/server/auth";
import { HistoryClient, type ClientVersionEntry } from "./HistoryClient";
import styles from "./history.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProgramHistoryPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }
  const { id } = await params;

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  let program;
  try {
    program = await caller.program.get({ id });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "NOT_FOUND") {
      notFound();
    }
    throw err;
  }

  const versions = await caller.programVersion.listForProgram({
    programId: id,
  });

  // Order ascending by versionNumber to pair each version with its
  // predecessor. `listForProgram` returns them DESC (newest first); reverse
  // for the pairing pass, then the client re-renders newest-first.
  const ascending = [...versions].sort(
    (a, b) => a.versionNumber - b.versionNumber,
  );

  // Compute the diffs (previous → this) for every version after v1, in
  // parallel. Each `diff` call re-validates ownership + same-Program per
  // ARCH-040, but we already know both are owned — the calls are cheap.
  const diffs: (StructureDiffEntry[] | null)[] = await Promise.all(
    ascending.map(async (v, i) => {
      if (i === 0) return null; // v1 has no predecessor
      const prev = ascending[i - 1];
      if (!prev) return null; // narrows noUncheckedIndexedAccess
      return caller.programVersion.diff({
        fromVersionId: prev.id,
        toVersionId: v.id,
      });
    }),
  );

  // Build the entries the client will render (newest first, so reverse).
  const entries: ClientVersionEntry[] = ascending
    .map((v, i) => {
      const diff = diffs[i] ?? null;
      const fromVersionNumber = i > 0 ? ascending[i - 1]?.versionNumber : undefined;
      return {
        versionId: v.id,
        versionNumber: v.versionNumber,
        createdAtIso: v.createdAt.toISOString(),
        createdVia: v.createdVia,
        isInitial: i === 0,
        fromVersionNumber: fromVersionNumber ?? null,
        diff,
      };
    })
    .reverse();

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href={`/app/programs/${program.id}`}>
          &larr; {program.name}
        </Link>
      </nav>
      <HistoryClient programName={program.name} entries={entries} />
    </main>
  );
}