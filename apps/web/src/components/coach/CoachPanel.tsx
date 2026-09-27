'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TRPCProvider, trpc } from '@/src/lib/trpc';
import type {
  ClientAIMessageSegment,
  ClientCoachMessage,
  EvidenceTag,
} from '@/src/types/coach';
import styles from './CoachPanel.module.css';

/**
 * CoachPanel — the AI Coach chat surface.
 *
 * Rendered beside Review (via 8e-4) and on the dedicated /app/coach route
 * (via 8e-3). Given a conversationId, the panel:
 *
 *   - loads existing messages via coach.getConversation,
 *   - streams new turns via coach.postMessage (a tRPC subscription),
 *   - renders the six segment types,
 *   - offers an "Apply this change" button on apply_confirmation segments,
 *     which fires programVersion.commitFromSimulation — the ONLY apply path
 *     from the Coach UI. The server-side Coach code has no import path to
 *     any commit function (ARCH-011, ARCH-018).
 *
 * Wrapped in its own TRPCProvider so the panel is self-contained and can be
 * dropped into any RSC without the page needing to arrange providers. Two
 * providers per Review page share the module-level browserQueryClient
 * singleton in trpc.tsx, so the react-query cache is not duplicated.
 */

const MAX_INPUT_LENGTH = 4000;

interface Props {
  conversationId: string;
  /** Cosmetic header label, e.g. "This block's review". */
  contextLabel?: string;
}

export function CoachPanel(props: Props) {
  return (
    <TRPCProvider>
      <CoachPanelInner {...props} />
    </TRPCProvider>
  );
}

// ── Inner (has provider context) ─────────────────────────────────────────

interface DisplayMessage {
  id: string;
  role: 'USER' | 'ASSISTANT';
  segments: ClientAIMessageSegment[];
}

interface PendingSubmission {
  text: string;
  /** Nonce so re-renders do not re-fire the same submission. */
  id: string;
}

function CoachPanelInner({ conversationId, contextLabel }: Props) {
  const conversationQuery = trpc.coach.getConversation.useQuery(
    { id: conversationId },
    { staleTime: Infinity, refetchOnWindowFocus: false },
  );

  const [newMessages, setNewMessages] = useState<DisplayMessage[]>([]);
  const [streamingSegments, setStreamingSegments] = useState<
    ClientAIMessageSegment[]
  >([]);
  const [submission, setSubmission] = useState<PendingSubmission | null>(null);
  const [inputText, setInputText] = useState('');
  const [subscriptionError, setSubscriptionError] = useState<string | null>(
    null,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Subscription ────────────────────────────────────────────────────
  //
  // Fires once per submission, when `submission !== null`. On final or
  // error, `submission` is cleared and the subscription stops.
  trpc.coach.postMessage.useSubscription(
    {
      conversationId,
      text: submission?.text ?? '',
    },
    {
      enabled: submission !== null,
      onData: (chunk) => {
        if (chunk.type === 'segment') {
          setStreamingSegments((prev) => [...prev, chunk.segment]);
          return;
        }
        if (chunk.type === 'final') {
          setNewMessages((prev) => [
            ...prev,
            {
              id: chunk.messageId,
              role: 'ASSISTANT',
              segments: chunk.segments,
            },
          ]);
          setStreamingSegments([]);
          setSubmission(null);
          return;
        }
        if (chunk.type === 'error') {
          setNewMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'ASSISTANT',
              segments: [
                {
                  type: 'grounding_warning',
                  content: `The Coach could not complete this turn: ${chunk.message}`,
                },
              ],
            },
          ]);
          setStreamingSegments([]);
          setSubmission(null);
          return;
        }
        // 'delta' chunks are reserved but not emitted by the current
        // orchestrator (see packages/ai/src/orchestrator.ts). No-op.
      },
      onError: (err) => {
        setSubscriptionError(err.message);
        setStreamingSegments([]);
        setSubmission(null);
      },
    },
  );

  // ── Auto-scroll to newest content ───────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [newMessages.length, streamingSegments.length]);

  // ── Submit ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = inputText.trim();
      if (text.length === 0 || submission !== null) return;
      setSubscriptionError(null);
      setNewMessages((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          role: 'USER',
          segments: [{ type: 'text', content: text }],
        },
      ]);
      setSubmission({ text, id: crypto.randomUUID() });
      setInputText('');
    },
    [inputText, submission],
  );

  // ── Merged message list ─────────────────────────────────────────────
  const persisted: DisplayMessage[] =
    conversationQuery.data?.messages.map((m: ClientCoachMessage) => ({
      id: m.id,
      // TOOL-role rows never reach the renderer — they are filtered
      // server-side by listRecentMessagesForContext and would not appear in
      // a conversation loaded via coach.getConversation either. Cast is for
      // the union's sake; the runtime value is USER or ASSISTANT.
      role: m.role === 'USER' ? 'USER' : 'ASSISTANT',
      segments: m.segments,
    })) ?? [];
  const allMessages = [...persisted, ...newMessages];

  const isStreaming = submission !== null;
  const isAwaitingFirstSegment = isStreaming && streamingSegments.length === 0;

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <h2 className={styles.heading}>Coach</h2>
        {contextLabel ? (
          <p className={styles.contextLabel}>{contextLabel}</p>
        ) : null}
      </header>

      <div className={styles.messages}>
        {conversationQuery.isLoading ? (
          <p className={styles.muted}>Loading conversation…</p>
        ) : null}

        {allMessages.length === 0 && !isStreaming ? (
          <p className={styles.emptyState}>
            Ask about your program — why an assessment looks the way it does,
            or what a change would do.
          </p>
        ) : null}

        {allMessages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {isAwaitingFirstSegment ? (
          <div className={styles.thinkingRow}>
            <span className={styles.thinkingDot} />
            <span className={styles.thinkingDot} />
            <span className={styles.thinkingDot} />
            <span className={styles.muted}>Thinking…</span>
          </div>
        ) : null}

        {streamingSegments.length > 0 ? (
          <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
            {streamingSegments.map((seg, i) => (
              <SegmentRenderer key={`stream-${i}`} segment={seg} />
            ))}
          </div>
        ) : null}

        {subscriptionError ? (
          <p className={styles.warning}>
            Connection problem: {subscriptionError}
          </p>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

            {conversationQuery.data?.temporaryConstraints &&
      conversationQuery.data.temporaryConstraints.length > 0 ? (
        <div className={styles.tempConstraints}>
          <span className={styles.tempConstraintsLabel}>
            For this conversation:
          </span>
          <ul className={styles.tempConstraintsList}>
            {conversationQuery.data.temporaryConstraints.map((tc) => (
              <li key={tc.id} className={styles.tempConstraintChip}>
                {tc.note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <textarea
          className={styles.input}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask the Coach…"
          maxLength={MAX_INPUT_LENGTH}
          rows={2}
          disabled={isStreaming}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={isStreaming || inputText.trim().length === 0}
        >
          {isStreaming ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────────────

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'USER';
  return (
    <div
      className={`${styles.bubble} ${
        isUser ? styles.bubbleUser : styles.bubbleAssistant
      }`}
    >
      {message.segments.map((seg, i) => (
        <SegmentRenderer key={`${message.id}-${i}`} segment={seg} />
      ))}
    </div>
  );
}

// ── Segment renderer (exhaustive over the six segment types) ─────────────

function SegmentRenderer({ segment }: { segment: ClientAIMessageSegment }) {
  switch (segment.type) {
    case 'text':
      return <p className={styles.segmentText}>{segment.content}</p>;

    case 'claim':
      return (
        <p className={styles.segmentClaim}>
          <span className={`${styles.tag} ${tagClass(segment.tag)}`}>
            {segment.tag}
          </span>
          <span>{segment.content}</span>
        </p>
      );

    case 'apply_confirmation':
      return <ApplyConfirmation segment={segment} />;

    case 'constraint_notice':
      return (
        <p className={styles.segmentNotice}>
          {segment.content}{' '}
          <Link href="/app/constraints" className={styles.noticeLink}>
            View constraints →
          </Link>
        </p>
      );

    case 'temporary_constraint_notice':
      return (
        <p className={styles.segmentNotice}>
          {segment.content}{' '}
          <span className={styles.noticeMeta}>(this conversation only)</span>
        </p>
      );

    case 'grounding_warning':
      return <p className={styles.segmentWarning}>{segment.content}</p>;
  }
}

function tagClass(tag: EvidenceTag): string | undefined {
  switch (tag) {
    case 'PLANNED':
      return styles.tagPlanned;
    case 'EXECUTED':
      return styles.tagExecuted;
    case 'OBSERVED':
      return styles.tagObserved;
    case 'INTERPRETED':
      return styles.tagInterpreted;
  }
}

// ── Apply button ─────────────────────────────────────────────────────────
//
// The ONLY apply path from the Coach UI. Clicking fires the Phase 5
// programVersion.commitFromSimulation mutation. No automatic trigger, no
// effect — the button is inert until a human clicks it.

function ApplyConfirmation({
  segment,
}: {
  segment: Extract<ClientAIMessageSegment, { type: 'apply_confirmation' }>;
}) {
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = trpc.programVersion.commitFromSimulation.useMutation({
    onSuccess: () => {
      setApplied(true);
      setError(null);
    },
    onError: (err) => {
      // STALE_SIMULATION and PRECONDITION_FAILED surface here with a
      // clear message. Do not retry automatically.
      setError(err.message);
    },
  });

  if (applied) {
    return (
      <div className={styles.applyBlock}>
        <p className={styles.appliedConfirm}>
          ✓ Applied. A new program version has been committed.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.applyBlock}>
      <p className={styles.applySummary}>{segment.payload.summary}</p>
      <button
        type="button"
        className={styles.applyButton}
        disabled={commit.isPending}
        onClick={() => {
          setError(null);
          commit.mutate({ simulationId: segment.payload.simulationId });
        }}
      >
        {commit.isPending ? 'Applying…' : 'Apply this change'}
      </button>
      {error ? <p className={styles.applyError}>{error}</p> : null}
    </div>
  );
}