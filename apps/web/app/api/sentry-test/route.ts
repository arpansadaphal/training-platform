import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const error = new Error("sentry-server-phase0-test");
  Sentry.captureException(error);
  // On Vercel, Lambda freezes immediately after the response is sent.
  // Without this flush, the event never leaves the process.
  await Sentry.flush(2000);
  throw error;
  return NextResponse.json({ ok: true });
}
