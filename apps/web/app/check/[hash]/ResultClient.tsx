"use client";

// apps/web/app/check/[hash]/ResultClient.tsx
//
// Fetches the assessment for a hash over HTTP (so the Edge rate limit applies) and renders it through the
// shared AssessmentDisplay. Below it, the optional sign-up handoff: the hash is parked in sessionStorage and
// /app offers to save it as a first program.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHECK_COPY } from "@training/domain";
import { AssessmentDisplay } from "@/components/assessment/AssessmentDisplay";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import { CtaPanel } from "./CtaPanel";
import styles from "../check.module.css";

interface Props {
  hash: string;
  /** Signed in and arrived with ?import=1 (the sessionStorage-unavailable fallback). */
  canImport: boolean;
}

/** A batched-link error from a non-tRPC 429 body (the Edge middleware) carries the HTTP response in meta. */
function isRateLimited(error: { data?: { httpStatus?: number } | null; meta?: unknown }): boolean {
  const meta = error.meta as { response?: { status?: number } } | undefined;
  return error.data?.httpStatus === 429 || meta?.response?.status === 429;
}

function Result({ hash, canImport }: Props) {
  const router = useRouter();
  const query = trpc.check.analyze.useQuery({ hash }, { retry: false, refetchOnWindowFocus: false });
  const save = trpc.check.save.useMutation({
    onSuccess: ({ programId }) => router.push(`/app/programs/${programId}/build`),
  });

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{CHECK_COPY.resultHeading}</h1>

      {canImport ? (
        <div className={styles.panel}>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={save.isPending} onClick={() => save.mutate({ hash })}>
              {save.isPending ? CHECK_COPY.importSaving : CHECK_COPY.importSave}
            </button>
          </div>
          {save.isError ? (
            <p className={styles.error} role="alert">
              {CHECK_COPY.importError}
            </p>
          ) : null}
        </div>
      ) : null}

      {query.isPending ? <p className={styles.lead}>{CHECK_COPY.resultLoading}</p> : null}

      {query.isError ? (
        <>
          <p className={styles.error} role="alert">
            {isRateLimited(query.error) ? CHECK_COPY.rateLimited : CHECK_COPY.resultError}
          </p>
          <div className={styles.actions}>
            <Link href="/check" className={styles.secondary}>
              {CHECK_COPY.backToChecker}
            </Link>
            {isRateLimited(query.error) ? (
              <Link href="/signup" className={styles.primary}>
                {CHECK_COPY.createAccount}
              </Link>
            ) : null}
          </div>
        </>
      ) : null}

      {query.data ? (
        <>
          <p className={styles.lead}>{CHECK_COPY.programSummary(query.data.summary.days, query.data.summary.exercises)}</p>
          <div className={styles.assessment}>
            <AssessmentDisplay
              result={query.data.assessment}
              fitScore={query.data.fitScore}
              namedActions={query.data.namedActions}
              checkMode
            />
          </div>
          {canImport ? null : <CtaPanel hash={hash} />}
        </>
      ) : null}
    </main>
  );
}

export function ResultClient(props: Props) {
  return (
    <TRPCProvider>
      <Result {...props} />
    </TRPCProvider>
  );
}
