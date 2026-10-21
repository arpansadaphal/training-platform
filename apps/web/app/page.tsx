import Link from "next/link";

/**
 * Public landing page (unauthenticated). Phase 0 shipped it as a shell;
 * Phase A replaced the "Phase 0 shell" note with what the product does now.
 * No outcome-guarantee language (invariant 9).
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
        <ul>
          <li>
            <strong>Build</strong> a split from the exercise library: sets, reps and target effort
            for every exercise.
          </li>
          <li>
            <strong>See the reasoning.</strong> Each finding shows its number, what it means, and
            the evidence tier behind the threshold it was judged against.
          </li>
          <li>
            <strong>Train and review.</strong> Log your sets, then compare what you planned with
            what you actually did.
          </li>
          <li>
            <strong>Ask the Coach</strong> why the analysis says what it says, or what a change
            would do. Nothing changes until you apply it.
          </li>
        </ul>
        <p>
          <Link href="/signup">Create an account</Link>
        </p>
      </main>
    </>
  );
}