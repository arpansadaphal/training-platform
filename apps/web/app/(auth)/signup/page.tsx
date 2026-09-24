import Link from "next/link";
import { signupAction } from "./actions";

export default function SignupPage() {
  return (
    <main>
      <h1>Sign up</h1>
      <form action={signupAction}>
        <label>
          Name (optional)
          <input name="name" type="text" autoComplete="name" />
        </label>
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password (min 8 characters)
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <button type="submit">Create account</button>
      </form>
      <p className="muted">
        Already have an account? <Link href="/login">Log in</Link>.
      </p>
    </main>
  );
}