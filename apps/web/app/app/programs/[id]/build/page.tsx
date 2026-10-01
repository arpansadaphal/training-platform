// apps/web/app/app/programs/[id]/build/page.tsx
//
// RSC shell for the Builder. Loads program, drafts, exercise reference data,
// and — new in Phase 5 — the active version's structure, so the simulate
// panel can populate its workout-day and prescription pickers without a
// second client-side round trip.
//
// The actual Build↔Analyze↔Commit↔Simulate loop lives in BuilderClient.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@training/api";
import type {
  ExerciseRecord,
  ProgramDraftRecord,
} from "@training/db";
import type { ProgramStructure } from "@training/domain";
import { auth } from "@/src/server/auth";
import { BuilderClient } from "./BuilderClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BuildPage({ params }: PageProps) {
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

  const [drafts, exercises]: [ProgramDraftRecord[], ExerciseRecord[]] =
    await Promise.all([
      caller.draft.listForProgram({ programId: id }),
      caller.exercise.listAll(),
    ]);

  // Phase 5 — the simulate panel needs the active version's structure to
  // populate its pickers. A null activeVersionId is legal (a program with no
  // committed version yet); the panel renders a "commit first" hint.
  let activeVersionStructure: ProgramStructure | null = null;
  if (program.activeVersionId) {
    const active = await caller.programVersion.get({
      versionId: program.activeVersionId,
    });
    activeVersionStructure =
      active.version.structureSnapshot as ProgramStructure;
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "72rem", margin: "0 auto" }}>
      <p style={{ opacity: 0.7 }}>
        <Link href={`/app/programs/${id}`}>&larr; {program.name}</Link>
      </p>

      <h1>Build — {program.name}</h1>

      <BuilderClient
        programId={id}
        initialDrafts={drafts}
        initialExercises={exercises}
        initialActiveVersionId={program.activeVersionId}
        initialActiveVersionStructure={activeVersionStructure}
      />
    </main>
  );
}