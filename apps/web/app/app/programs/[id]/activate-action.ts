// apps/web/app/app/programs/[id]/activate-action.ts
//
// Server action for the "Activate this version" button on the program
// detail page.
//
// A version activation is NOT a commit: it points Program.activeVersionId
// at an existing committed ProgramVersion. The lifecycle side effect
// (closing any prior TrainingBlock, opening a new one) runs inside the same
// transaction as the pointer flip — see trainingService.activateVersion.
//
// Colocated at [id]/ rather than sharing apps/web/app/app/programs/actions.ts
// (which carries the list-level create + rename + archive actions): this
// action is specific to the detail page and has one caller.
//
// CRITICAL: redirect() must sit OUTSIDE any try/catch. It throws
// NEXT_REDIRECT as a sentinel error; a generic catch swallows it silently,
// and the redirect never fires. Same trap exists in startTrainingAction
// (apps/web/app/train/actions.ts) and is called out there too.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";

export async function activateVersionAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }

  const programVersionId = String(formData.get("programVersionId") ?? "");
  const programId = String(formData.get("programId") ?? "");
  if (!programVersionId || !programId) {
    throw new Error("Missing programVersionId or programId");
  }

  const caller = appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });

  await caller.training.activateVersion({ programVersionId });

  // Re-render the current program detail page so the "(active)" marker
  // moves and the block-close/open side effect is visible on the next
  // visit. No redirect — the user stays on the program page.
  revalidatePath(`/app/programs/${programId}`);
}