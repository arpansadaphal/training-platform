// Minimal Program list + create UI.
//
// Phase 1 only: enough to exercise the new API by hand. The real Builder
// arrives in Phase 4. Rendered as a Server Component in the existing
// authenticated shell — same pattern as apps/web/app/app/page.tsx.

import Link from "next/link";
import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { createProgramAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });
  const programs = await caller.program.listMine({ includeArchived: false });

  return (
    <main style={{ padding: "2rem", maxWidth: "48rem", margin: "0 auto" }}>
      <h1>Your Programs</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Create a new Program</h2>
        <form
          action={createProgramAction}
          style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
        >
          <input
            name="name"
            placeholder="e.g. 4-day upper/lower"
            required
            maxLength={120}
            style={{ flex: 1, padding: "0.5rem" }}
          />
          <button type="submit" style={{ padding: "0.5rem 1rem" }}>
            Create
          </button>
        </form>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Existing</h2>
        {programs.length === 0 ? (
          <p style={{ opacity: 0.7 }}>No programs yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: "0.5rem" }}>
            {programs.map((p) => (
              <li
                key={p.id}
                style={{
                  padding: "0.75rem 0",
                  borderBottom: "1px solid #eee",
                }}
              >
                <Link href={`/app/programs/${p.id}`}>{p.name}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}