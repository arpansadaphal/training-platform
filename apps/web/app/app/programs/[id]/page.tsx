// Program detail. Phase 1: rename + archive. Phase 4 addition: entry point
// into the Builder, plus a summary of active drafts and committed versions.
// Phase 6 addition: an "Activate this version" button next to every
// non-active version — the manual entry point into the TrainingBlock
// lifecycle (the commit path runs the same close+open sequence
// automatically; see programVersionService.commitFromMutation).
//
// Still a Server Component in the authenticated shell — the interactivity
// lives one level down in /build and in the activate-action server action.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { renameProgramAction, archiveProgramAction } from "../actions";
import { activateVersionAction } from "./activate-action";

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

  const [drafts, versions] = await Promise.all([
    caller.draft.listForProgram({ programId: id }),
    caller.programVersion.listForProgram({ programId: id }),
  ]);

  const activeVersion = versions.find((v) => v.id === program.activeVersionId);

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
        <Link
          href={`/app/programs/${program.id}/build`}
          style={{
            display: "inline-block",
            padding: "0.55rem 0.9rem",
            border: "1px solid var(--accent)",
            background: "var(--accent)",
            color: "#fff",
            borderRadius: "4px",
            textDecoration: "none",
          }}
        >
          Open Builder
        </Link>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Drafts</h2>
        {drafts.length === 0 ? (
          <p style={{ opacity: 0.7 }}>
            No active drafts. Open the Builder to start one.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: "0.5rem" }}>
            {drafts.map((d) => (
              <li
                key={d.id}
                style={{
                  padding: "0.5rem 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <Link href={`/app/programs/${program.id}/build`}>{d.label}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Versions</h2>
        {versions.length === 0 ? (
          <p style={{ opacity: 0.7 }}>
            No committed versions yet. Commit a draft in the Builder.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: "0.5rem" }}>
            {versions.map((v) => {
              const isActive = activeVersion?.id === v.id;
              const canActivate = !program.archivedAt && !isActive;
              return (
                <li
                  key={v.id}
                  style={{
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <span>Version {v.versionNumber}</span>
                  {isActive ? (
                    <span
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--muted)",
                      }}
                    >
                      (active)
                    </span>
                  ) : null}
                  {canActivate ? (
                    <form
                      action={activateVersionAction}
                      style={{ marginLeft: "auto" }}
                    >
                      <input
                        type="hidden"
                        name="programVersionId"
                        value={v.id}
                      />
                      <input
                        type="hidden"
                        name="programId"
                        value={program.id}
                      />
                      <button
                        type="submit"
                        style={{
                          padding: "0.35rem 0.75rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        Activate this version
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
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