'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { useState, type ReactNode } from 'react';

import type { AppRouter } from '@training/api';

/**
 * The single tRPC client instance for the app.
 *
 * The `trpc` export is the react-query integration (queries, mutations,
 * subscriptions). `TRPCProvider` wraps `trpc.Provider` with a QueryClient so
 * a route can mount one component and get both.
 *
 * Subscriptions route through `httpSubscriptionLink` (SSE over POST), which
 * is what the Coach's `coach.postMessage` uses. Everything else routes
 * through the batched HTTP link. `splitLink` evaluates per-call on the
 * operation's type — `'subscription'` is set by tRPC for subscription
 * procedures.
 */
export const trpc = createTRPCReact<AppRouter>();

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  // Server: always a fresh client, to avoid sharing state across requests.
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  // Browser: a module-level singleton, so the client survives RSC re-renders.
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function TRPCProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url: '/api/trpc',
          }),
          false: httpBatchLink({
            url: '/api/trpc',
          }),
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

/**
 * Alias for consumers that prefer `api.*`. Both point at the same
 * createTRPCReact instance — do not construct a second one.
 */
export const api = trpc;