// apps/web/app/app/coach/CoachClient.tsx
//
// The dedicated Coach route's interactive surface.
//
// Layout: a narrow left sidebar listing the user's conversations, and a
// main column rendering CoachPanel for the selected one. Selecting a
// conversation swaps the panel; the panel owns its own subscription and
// message loading.
//
// Wrapped in TRPCProvider so this component can call coach.openConversation
// and coach.listConversations. CoachPanel also wraps itself — the double
// wrap shares the browserQueryClient singleton (see trpc.tsx), so no cache
// is duplicated.

"use client";

import { useState } from "react";
import { CoachPanel } from "@/src/components/coach/CoachPanel";
import { TRPCProvider, trpc } from "@/src/lib/trpc";
import styles from "./coach.module.css";

export interface ClientConversationSummary {
  id: string;
  programId: string | null;
  programVersionId: string | null;
  createdAtISO: string;
}

interface Props {
  initialConversations: ClientConversationSummary[];
}

export function CoachClient(props: Props) {
  return (
    <TRPCProvider>
      <CoachClientInner {...props} />
    </TRPCProvider>
  );
}

function CoachClientInner({ initialConversations }: Props) {
  const [conversations, setConversations] =
    useState<ClientConversationSummary[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );

  // `coach.openConversation` is a get-or-create. After ARCH-047 it auto-scopes
  // to the user's primary Program, so pressing "+ New" a second time returns
  // the *same* conversation id. Handle that by selecting the existing entry
  // rather than appending a duplicate — the list must remain a set of distinct
  // ids or React will warn and the active-state class will apply to several
  // cards at once, which reads as "clicking any card shows the same content."
  const openNew = trpc.coach.openConversation.useMutation({
    onSuccess: (created) => {
      const summary: ClientConversationSummary = {
        id: created.id,
        programId: created.programId,
        programVersionId: created.programVersionId,
        createdAtISO: created.createdAtISO,
      };
      setConversations((prev) => {
        const existingIndex = prev.findIndex((c) => c.id === summary.id);
        if (existingIndex !== -1) {
          // Server returned an existing conversation. Replace the entry in
          // place so any fields that changed (unlikely today, but the shape
          // allows it) reflect, without adding a duplicate row.
          const next = [...prev];
          next[existingIndex] = summary;
          return next;
        }
        return [summary, ...prev];
      });
      setSelectedId(summary.id);
    },
  });

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h1 className={styles.heading}>Coach</h1>
          <button
            type="button"
            className={styles.newButton}
            disabled={openNew.isPending}
                        onClick={() =>
              openNew.mutate({
                programId: null,
                programVersionId: null,
                forceNew: true,
              })
            }
          >
            {openNew.isPending ? "…" : "+ New"}
          </button>
        </div>

        {openNew.isError ? (
          <p className={styles.sidebarError}>
            Could not start a new conversation: {openNew.error.message}
          </p>
        ) : null}

        {conversations.length === 0 ? (
          <p className={styles.sidebarEmpty}>
            No conversations yet. Start one above.
          </p>
        ) : (
          <ul className={styles.conversationList}>
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`${styles.conversationItem} ${
                    c.id === selectedId ? styles.conversationItemActive : ""
                  }`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className={styles.conversationLabel}>
                    {formatConversationLabel(c)}
                  </span>
                  <span className={styles.conversationScope}>
                    {c.programId ? "Program-scoped" : "General"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className={styles.main}>
        {selectedId === null ? (
          <div className={styles.placeholder}>
            <p className={styles.placeholderBody}>
              Select a conversation on the left, or start a new one.
            </p>
            <p className={styles.placeholderMeta}>
              The Coach can explain your current assessment or explore what a
              change would do. It never applies a change on its own.
            </p>
          </div>
        ) : (
          // key forces a remount when the conversation changes, so CoachPanel's
          // internal state (newMessages, streamingSegments, submission) does
          // not bleed from one conversation into the next.
          <CoachPanel key={selectedId} conversationId={selectedId} />
        )}
      </section>
    </div>
  );
}

/**
 * Conversations have no title (the schema does not carry one). Label by
 * creation time — enough to distinguish entries in a list that is almost
 * always short. If a later phase adds titles or derives them from the
 * first user message, replace this function.
 */
function formatConversationLabel(c: ClientConversationSummary): string {
  const date = new Date(c.createdAtISO);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}