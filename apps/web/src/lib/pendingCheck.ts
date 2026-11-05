// A checked program waiting for the visitor to sign up. Stored as the same
// base64url hash the /check/[hash] URL carries. sessionStorage can throw
// (Safari private mode, blocked site data), so every access is guarded and the
// caller gets a boolean / null instead of an exception.

import { decodeCompactProgram } from "@training/domain";

export const PENDING_CHECK_KEY = "pending_program_check";

export function storePendingCheck(hash: string): boolean {
  try {
    window.sessionStorage.setItem(PENDING_CHECK_KEY, hash);
    return window.sessionStorage.getItem(PENDING_CHECK_KEY) === hash;
  } catch {
    return false;
  }
}

/** The stored hash, only if it still decodes to a program. */
export function readPendingCheck(): string | null {
  try {
    const hash = window.sessionStorage.getItem(PENDING_CHECK_KEY);
    return hash !== null && decodeCompactProgram(hash) !== null ? hash : null;
  } catch {
    return null;
  }
}

export function clearPendingCheck(): void {
  try {
    window.sessionStorage.removeItem(PENDING_CHECK_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
