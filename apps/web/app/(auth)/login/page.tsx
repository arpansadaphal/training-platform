import Link from "next/link";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main>
      <h1>Log in</h1>
      {error ? (
        <p className="error">
          {error === "credentials"
            ? "Invalid email or password."
            : "Something went wrong. Try again."}
        </p>
      ) : null}
      <form action={loginAction}>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
          />
        </label>
        <button type="submit">Log in</button>
      </form>
      <p className="muted">
        No account? <Link href="/signup">Sign up</Link>.
      </p>
    </main>
  );
}