// apps/web/app/check/page.tsx
//
// Public Program Checker (no account). Gated by CHECK_PUBLIC: off means a 404.
// The exercise library is public reference data, read in-process here and handed to the client parser.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { appRouter } from "@training/api";
import { isCheckPublic } from "@training/config";
import { CHECK_COPY } from "@training/domain";
import { CheckNav } from "./CheckNav";
import { CheckClient } from "./CheckClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: CHECK_COPY.pageTitle,
  description: CHECK_COPY.pageDescription,
};

export default async function CheckPage() {
  if (!isCheckPublic()) notFound();
  const exercises = await appRouter.createCaller({ user: null }).check.exercises();
  return (
    <>
      <CheckNav />
      <CheckClient exercises={exercises} />
    </>
  );
}
