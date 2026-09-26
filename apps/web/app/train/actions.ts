// apps/web/app/train/actions.ts
//
// Server actions for the /train route.
//
// startTrainingAction: the "Start training" / "Continue training" button on
// /train. It calls session.getOrCreateNext, which either returns the
// currently PLANNED/IN_PROGRESS Session for the Program or creates the next
// one in rotation, then redirects to that Session's detail page.
//
// The action is a Next.js Server Action used directly as a <form action={...}>.
// It performs the same auth check every RSC page does (the action can run
// on a fresh request and must not trust that the caller saw a rendered page).

"use server";

import { redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";

export async function startTrainingAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const programId = String(formData.get("programId") ?? "");
  if (!programId) {
    throw new Error("Missing programId");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  // getOrCreateNext is a mutation even though the name reads like a read:
  // on the first call for a fresh block it writes a Session row. The
  // redirect is deliberately outside the try — Next.js's redirect() throws
  // a sentinel error that must propagate; catching it here would swallow
  // the redirect.
  let sessionId: string;
  try {
    const sessionRecord = await caller.session.getOrCreateNext({ programId });
    sessionId = sessionRecord.id;
  } catch (err) {
    if (err instanceof TRPCError && err.code === "PRECONDITION_FAILED") {
      // The user reached a Program with no active TrainingBlock. With
      // ARCH-039's commit-triggered lifecycle in place this should not
      // happen for any Program whose activeVersionId is non-null, but a
      // Program created under the older code paths (or a data anomaly)
      // could still land here. Rethrow with a message the Next.js error
      // boundary can render.
      throw new Error(
        "This program has no active training block. Open the Builder, commit a version, or activate an existing version first.",
      );
    }
    throw err;
  }

  redirect(`/train/session/${sessionId}`);
}