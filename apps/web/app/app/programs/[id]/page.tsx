// Minimal single-Program view: rename + archive.
//
// Phase 1 only. No Draft editing, no Analysis, no commit — those arrive
// in later phases. Rendered as a Server Component in the authenticated shell.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { renameProgramAction, archiveProgramAction } from "../actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProgramDetailPage({ params }: PageProps) {
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

  return (
    <main style={{ padding: "2rem", maxWidth: "48rem", margin: "0 auto" }}>
      <p style={{ opacity: 0.7 }}>
        <Link href="/app/programs">&larr; All programs</Link>
      </p>

      <h1>{program.name}</h1>
      {program.archivedAt ? (
        <p style={{ color: "#a00" }}>Archived</p>
      ) : null}

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Rename</h2>
        <form
          action={renameProgramAction}
          style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
        >
          <input type="hidden" name="id" value={program.id} />
          <input
            name="name"
            defaultValue={program.name}
            required
            maxLength={120}
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button type="submit" style={{ padding: "0.5rem 1rem" }}>
            Save
          </button>
        </form>
      </section>

      {!program.archivedAt ? (
        <section style={{ marginTop: "2rem" }}>
          <h2>Archive</h2>
          <form action={archiveProgramAction} style={{ marginTop: "0.5rem" }}>
            <input type="hidden" name="id" value={program.id} />
            <button type="submit" style={{ padding: "0.5rem 1rem" }}>
              Archive this Program
            </button>
          </form>
        </section>
      ) : null}
    </main>
  );
}