"use client";

// apps/web/app/app/PendingCheckBanner.tsx
//
// Shown on /app right after sign-up when the visitor checked a program first (Program Checker handoff).
// The program waits in sessionStorage as a hash; Save turns it into a Program with one draft and opens the
// Builder on it, Discard forgets it. Renders nothing when there is no pending program.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CHECK_COPY } from "@training/domain";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import { clearPendingCheck, readPendingCheck } from "@/src/lib/pendingCheck";
import styles from "./dashboard.module.css";

function Banner({ hash, onDone }: { hash: string; onDone: () => void }) {
  const router = useRouter();
  const save = trpc.check.save.useMutation({
    onSuccess: ({ programId }) => {
      clearPendingCheck();
      router.push(`/app/programs/${programId}/build`);
    },
  });

  return (
    <section className={styles.pendingBanner} aria-label="Saved program check">
      <p className={styles.pendingText}>{CHECK_COPY.pendingBanner}</p>
      <div className={styles.pendingActions}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={save.isPending}
          onClick={() => save.mutate({ hash })}
        >
          {save.isPending ? CHECK_COPY.importSaving : CHECK_COPY.pendingSave}
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            clearPendingCheck();
            onDone();
          }}
        >
          {CHECK_COPY.pendingDiscard}
        </button>
      </div>
      {save.isError ? (
        <p role="alert" className={styles.pendingText}>
          {CHECK_COPY.importError}
        </p>
      ) : null}
    </section>
  );
}

export function PendingCheckBanner() {
  const [hash, setHash] = useState<string | null>(null);

  // sessionStorage exists only in the browser, so it is read after mount.
  useEffect(() => {
    setHash(readPendingCheck());
  }, []);

  if (hash === null) return null;
  return (
    <TRPCProvider>
      <Banner hash={hash} onDone={() => setHash(null)} />
    </TRPCProvider>
  );
}
