import Link from "next/link";
import { CHECK_COPY, CHECK_LIMITS, decodeCompactProgram } from "@training/domain";
import { signupAction } from "./actions";
import styles from "./signup.module.css";

interface Props {
  searchParams: Promise<{ from?: string; h?: string; n?: string }>;
}

const MAX_EXERCISES = CHECK_LIMITS.maxDays * CHECK_LIMITS.maxRowsPerDay;

/**
 * How many exercises the checked program has, for "Save your 26-exercise program." It is decoration, so it is
 * trusted only as far as it can be checked: a program hash that decodes, else a whole number in range, else nothing.
 */
function exerciseCount(hash: string | null, n: string | undefined): number | null {
  if (hash !== null) {
    const program = decodeCompactProgram(hash);
    if (program !== null) return program.days.reduce((total, day) => total + day.rows.length, 0);
  }
  if (n !== undefined && /^\d{1,3}$/.test(n)) {
    const count = Number(n);
    if (count >= 1 && count <= MAX_EXERCISES) return count;
  }
  return null;
}

export default async function SignupPage({ searchParams }: Props) {
  const { from, h, n } = await searchParams;
  const fromCheck = from === "check";
  // The program hash rides in the URL only when the browser could not keep it in sessionStorage.
  const checkHash = fromCheck && h !== undefined && decodeCompactProgram(h) !== null ? h : null;
  const exercises = fromCheck ? exerciseCount(checkHash, n) : null;
  const heading = !fromCheck
    ? CHECK_COPY.signupHeadingGeneric
    : exercises !== null
      ? CHECK_COPY.signupHeadingSaveCount(exercises)
      : CHECK_COPY.signupHeadingSave;
  return (
    <main>
      <h1>{heading}</h1>
      <p className={styles.lead}>{CHECK_COPY.signupLead}</p>
      <ul className={styles.bullets}>
        {CHECK_COPY.signupBullets.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <form action={signupAction} className={styles.form}>
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
        {CHECK_COPY.signupHaveAccount}{" "}
        <Link href="/login" className={styles.signIn}>
          {CHECK_COPY.signupSignIn}
        </Link>
      </p>
    </main>
  );
}
