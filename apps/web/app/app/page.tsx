throw new Error("sentry-server-phase0-test");

import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth, signOut } from "@/src/server/auth";

/**
 * Authenticated empty dashboard shell.
 *
 * Server Component — calls the tRPC appRouter's caller directly (no HTTP
 * hop), which is the intended pattern for server-rendered reads. The HTTP
 * route handler at app/api/trpc/[trpc]/route.ts exists for client-side
 * callers and future mobile clients.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });
  const me = await caller.user.getSelf();

  return (
    <>
      <nav>
        <strong>Training Platform</strong>
        <span style={{ flex: 1 }} />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button type="submit">Sign out</button>
        </form>
      </nav>
      <main>
        <h1>Dashboard</h1>
        <p>
          Signed in as <strong>{me.email}</strong>
          {me.name ? ` (${me.name})` : ""}.
        </p>
        <p className="muted">
          This shell is intentionally empty. Program builder, analysis, and coach arrive in later
          phases.
        </p>
      </main>
    </>
  );
}