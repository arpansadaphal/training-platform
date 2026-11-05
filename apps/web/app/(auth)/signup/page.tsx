import Link from "next/link";
import { CHECK_COPY, decodeCompactProgram } from "@training/domain";
import { signupAction } from "./actions";

interface Props {
  searchParams: Promise<{ from?: string; h?: string }>;
}

export default async function SignupPage({ searchParams }: Props) {
  const { from, h } = await searchParams;
  const fromCheck = from === "check";
  // The program hash rides in the URL only when the browser could not keep it in sessionStorage.
  const checkHash = fromCheck && h !== undefined && decodeCompactProgram(h) !== null ? h : null;
  return (
    <main>
      <h1>Sign up</h1>
      {fromCheck ? <p className="muted">{CHECK_COPY.signupNote}</p> : null}
      <form action={signupAction}>
        {checkHash !== null ? <input type="hidden" name="checkHash" value={checkHash} /> : null}
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
