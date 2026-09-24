import Link from "next/link";

/**
 * Public landing page (unauthenticated). Per phase-00-foundation.md:
 * "Landing page, signup, login, empty authenticated dashboard shell.
 *  No Program-related UI of any kind."
 */
export default function LandingPage() {
  return (
    <>
      <nav>
        <strong>Training Platform</strong>
        <span style={{ flex: 1 }} />
        <Link href="/login">Log in</Link>
        <Link href="/signup">Sign up</Link>
      </nav>
      <main>
        <h1>Design training programs you can actually reason about.</h1>
        <p>
          Build a program, get it evaluated transparently against a stated goal with reasoning
          shown — never a black box — then train it and revise it using an honest record of what
          the design predicted versus what actually happened.
        </p>
        <p className="muted">
          This is a Phase 0 shell. The program builder, analysis engine, and coach arrive in later
          phases.
        </p>
        <p>
          <Link href="/signup">Create an account</Link>
        </p>
      </main>
    </>
  );
}