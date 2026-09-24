/**
 * tRPC request context.
 *
 * Deliberately does NOT import from next-auth — packages/api must stay
 * usable from any transport (Next.js today, a standalone HTTP adapter
 * later per ARCH-003's escape hatch). The route handler in apps/web maps
 * the Auth.js session into this plain shape.
 */

export interface ContextUser {
  id: string;
  email: string;
}

export interface Context {
  user: ContextUser | null;
}

export function createContext(input: { user: ContextUser | null }): Context {
  return { user: input.user };
}