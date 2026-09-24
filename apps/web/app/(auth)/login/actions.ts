"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/src/server/auth";

export async function loginAction(formData: FormData): Promise<void> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    // Fall through to signIn below with clearly-invalid input so Auth.js
    // produces a consistent error path rather than crashing.
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/app",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // Auth.js's signIn throws a redirect on success — only AuthError
      // reaches here.
      const { redirect } = await import("next/navigation");
      redirect(`/login?error=${error.type === "CredentialsSignin" ? "credentials" : "unknown"}`);
    }
    throw error;
  }
}