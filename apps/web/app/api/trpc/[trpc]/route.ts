import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, type ContextUser } from "@training/api";
import { auth } from "@/src/server/auth";

/**
 * The Next.js Route Handler that mounts packages/api's router at
 * /api/trpc. Per ARCH-003, this is the only HTTP surface for the API at
 * MVP; apps/mobile (future) calls this same endpoint.
 */
const handler = (req: Request): Promise<Response> =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const session = await auth();
      const user: ContextUser | null =
        session?.user?.id && session.user.email
          ? { id: session.user.id, email: session.user.email }
          : null;
      return { user };
    },
       onError({ error, path }) {
      // Non-UNAUTHORIZED errors are worth surfacing; Sentry's server SDK
      // (initialized via instrumentation.ts) captures them automatically.
      if (error.code !== "UNAUTHORIZED") {
        console.error(`tRPC error on '${path ?? "<no-path>"}':`, error);
      }
    },
  });

export { handler as GET, handler as POST };