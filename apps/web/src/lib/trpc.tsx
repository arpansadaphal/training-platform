// apps/web/src/lib/trpc.tsx
//
// Client-side tRPC wiring. Phase 1's RSC pages used
// `appRouter.createCaller(...)` directly — no client transport existed. The
// Builder is the first interactive surface, so this file introduces the
// client side for the first time.
//
// TRPCProvider is a client component. RSC pages that need client-side tRPC
// hooks render it as a boundary around their interactive child tree; there
// is no root-layout provider so that pages that don't need client tRPC (all
// of Phase 1's) continue to ship zero of this JavaScript.
//
// The QueryClient is created per TRPCProvider instance (via useState's lazy
// initializer) rather than module-scoped, so two mounted providers don't
// share cache state. This is the tRPC v11 recommended pattern.

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useState, type ReactNode } from "react";
import type { AppRouter } from "@training/api";

export const trpc = createTRPCReact<AppRouter>();

export function TRPCProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          // The Next.js route handler at apps/web/app/api/trpc/[trpc]/route.ts
          // mounts the same appRouter used by RSC callers. Relative URL so
          // this works in dev, preview, and production without env config.
          url: "/api/trpc",
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}