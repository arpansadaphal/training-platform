// apps/web/app/app/coach/page.tsx
//
// The dedicated Coach route. RSC wrapper that fetches the user's
// conversations and hands them to the client. The interactive surface
// (sidebar list, new-conversation button, panel selection) is in
// CoachClient.
//
// Auth is checked here, same pattern as the Review page — /app/* pages do
// their own auth check; there is no shared layout.

import Link from "next/link";
import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";
import { CoachClient, type ClientConversationSummary } from "./CoachClient";
import styles from "./coach.module.css";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  const conversations = await caller.coach.listConversations();

  // Project to the client shape. Deliberately minimal — the sidebar needs
  // an id, a scope indicator, and a timestamp; anything else the router
  // returns is dropped at this boundary.
  const initialConversations: ClientConversationSummary[] = conversations.map(
    (c) => ({
      id: c.id,
      programId: c.programId,
      programVersionId: c.programVersionId,
      createdAtISO: c.createdAtISO,
    }),
  );

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/app">&larr; Dashboard</Link>
      </nav>
      <CoachClient initialConversations={initialConversations} />
    </main>
  );
}