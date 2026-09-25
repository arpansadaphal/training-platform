"use server";

// Server Actions for the minimal Program UI.
//
// Every action mirrors the existing dashboard's in-process pattern:
// build the tRPC caller directly (no HTTP hop) with a context built from
// the Auth.js session, then invoke the procedure. Authorization is
// enforced inside programService, not here — actions only ensure a session
// exists and revalidate the affected path.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appRouter } from "@training/api";
import { auth } from "@/src/server/auth";

async function requireCaller() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    redirect("/login");
  }
  return appRouter.createCaller({
    user: { id: session.user.id, email: session.user.email },
  });
}

export async function createProgramAction(formData: FormData): Promise<void> {
  const caller = await requireCaller();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    throw new Error("Program name is required");
  }
  await caller.program.create({ name });
  revalidatePath("/app/programs");
}

export async function renameProgramAction(formData: FormData): Promise<void> {
  const caller = await requireCaller();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) {
    throw new Error("Program id and name are required");
  }
  await caller.program.rename({ id, name });
  revalidatePath("/app/programs");
  revalidatePath(`/app/programs/${id}`);
}

export async function archiveProgramAction(formData: FormData): Promise<void> {
  const caller = await requireCaller();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    throw new Error("Program id is required");
  }
  await caller.program.archive({ id });
  revalidatePath("/app/programs");
  redirect("/app/programs");
}