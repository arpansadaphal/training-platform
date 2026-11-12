// apps/web/app/check/[hash]/page.tsx
//
// A checked program, addressed by its hash so the link is shareable. The page itself does no analysis:
// ResultClient asks check.analyze over HTTP, which is where the per-IP limit applies (an in-process call here
// would skip the Edge middleware).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isCheckPublic } from "@training/config";
import { CHECK_COPY, CHECK_LIMITS, decodeCompactProgram } from "@training/domain";
import { auth } from "@/src/server/auth";
import { CheckNav } from "../CheckNav";
import { ResultClient } from "./ResultClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${CHECK_COPY.resultHeading} | ${CHECK_COPY.pageTitle}`,
  description: CHECK_COPY.pageDescription,
  robots: { index: false },
};

interface Props {
  params: Promise<{ hash: string }>;
  searchParams: Promise<{ import?: string; d?: string }>;
}

/** ARCH-067: days a week from `?d=`, only a whole number 1-7; anything else is ignored (the plain read). */
function readDays(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d$/.test(value)) return undefined;
  const n = Number(value);
  return n >= 1 && n <= CHECK_LIMITS.maxDays ? n : undefined;
}

export default async function CheckResultPage({ params, searchParams }: Props) {
  if (!isCheckPublic()) notFound();
  const { hash } = await params;
  if (decodeCompactProgram(hash) === null) notFound();
  const { import: importFlag, d } = await searchParams;
  const session = await auth();
  return (
    <>
      <CheckNav />
      <ResultClient hash={hash} daysPerWeek={readDays(d)} canImport={importFlag === "1" && Boolean(session?.user?.id)} />
    </>
  );
}
