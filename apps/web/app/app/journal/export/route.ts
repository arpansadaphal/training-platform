// apps/web/app/app/journal/export/route.ts
//
// Project 4: "Download my data". The lifter's logged sets as one CSV, with the
// session each belongs to and their note for it. Free and ungated. Nothing is
// stored: the file is built from the same history the journal reads.

import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";

export const dynamic = "force-dynamic";

/** Lets Excel read the file as UTF-8 (a note may hold any characters). */
const UTF8_BOM = String.fromCharCode(0xfeff);

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return new Response("Sign in to download your data.", { status: 401 });
  }
  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });
  const csv = await caller.journal.exportCsv();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(UTF8_BOM + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="your-training-data-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
