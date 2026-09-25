"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createUser, findUserByEmailWithHash } from "@training/db";
import { signIn } from "@/src/server/auth";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function signupAction(formData: FormData): Promise<void> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });

  if (!parsed.success) {
    // Phase 0 keeps error handling minimal — no product-grade UI yet.
    redirect("/signup?error=invalid-input");
  }

  const existing = await findUserByEmailWithHash(parsed.data.email);
  if (existing) {
    redirect("/signup?error=email-taken");
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await createUser({
    email: parsed.data.email,
    passwordHash,
    // ARCH-024: User.displayName is required (name → displayName rename).
    // The signup form still collects an optional "name"; we default to a
    // stable placeholder when the user leaves it blank.
    displayName: parsed.data.name ?? "Anonymous",
  });

  // signIn with redirectTo throws NEXT_REDIRECT on success; that's the
  // intended control flow for a Server Action.
  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: "/app",
  });
}