// packages/api/src/errors.ts
//
// Application-level error classes that carry structured payloads the client
// needs to drive distinct UX — most importantly the stale-draft case, where
// the UI must offer "clone the current version" rather than a generic
// failure toast.
//
// These extend TRPCError so no wrapping is needed at the router boundary:
// tRPC preserves TRPCError subclasses through its middleware, and the
// errorFormatter in ./trpc.ts narrows on `instanceof` to project only the
// safe fields onto the wire. `error.cause` is NEVER forwarded raw — see the
// comment in trpc.ts for why.
//
// The `appCode` field is deliberately NOT named `code`: TRPCError already
// has a `code` (the transport-level code), and shadowing it in a subclass
// is a footgun. `appCode` is the application-level discriminator the client
// reads from `error.data.cause.code`.

import { TRPCError } from "@trpc/server";

/**
 * The shape of the safe cause payload for a stale-draft error, as it appears
 * on the wire at `error.data.cause`. The client narrows on `.code`.
 */
export interface StaleDraftCause {
  code: "STALE_DRAFT";
  draftId: string;
  baseVersionId: string;
  currentVersionId: string | null;
}

/**
 * The shape of the safe cause payload for a not-active-draft error.
 */
export interface DraftNotActiveCause {
  code: "DRAFT_NOT_ACTIVE";
  draftId: string;
  draftStatus: string;
}

export type SafeErrorCause = StaleDraftCause | DraftNotActiveCause;

/**
 * Thrown when a Draft was created from a specific ProgramVersion and the
 * Program's active version has since moved on. Committing such a draft would
 * be a silent overwrite of whatever happened in between, which invariant 6
 * forbids. The client must offer "clone the current version and re-apply
 * your edits" rather than retrying the same commit.
 *
 * Transport code: CONFLICT.
 */
export class StaleDraftError extends TRPCError {
  readonly appCode = "STALE_DRAFT" as const;
  readonly draftId: string;
  readonly baseVersionId: string;
  readonly currentVersionId: string | null;

  constructor(input: {
    draftId: string;
    baseVersionId: string;
    currentVersionId: string | null;
  }) {
    super({
      code: "CONFLICT",
      message:
        "This draft was based on an older version of the program. Clone the current version to apply your edits.",
    });
    this.name = "StaleDraftError";
    this.draftId = input.draftId;
    this.baseVersionId = input.baseVersionId;
    this.currentVersionId = input.currentVersionId;
  }
}

/**
 * Thrown when a caller tries to mutate a draft whose status is no longer
 * ACTIVE (COMMITTED or DISCARDED). The DISCARDED enum value is unused in
 * Phase 4 — drafts are hard-deleted — but this error class handles both
 * non-ACTIVE states uniformly for forward compatibility.
 *
 * Transport code: PRECONDITION_FAILED.
 */
export class DraftNotActiveError extends TRPCError {
  readonly appCode = "DRAFT_NOT_ACTIVE" as const;
  readonly draftId: string;
  readonly draftStatus: string;

  constructor(input: { draftId: string; draftStatus: string }) {
    super({
      code: "PRECONDITION_FAILED",
      message: `Draft is not active (status: ${input.draftStatus}).`,
    });
    this.name = "DraftNotActiveError";
    this.draftId = input.draftId;
    this.draftStatus = input.draftStatus;
  }
}