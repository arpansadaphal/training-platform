// apps/web/app/api/sentry-test/route.ts
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  Sentry.captureException(new Error("sentry-server-phase0-test"));
  await Sentry.flush(5000);
  return NextResponse.json({ ok: true, sent: true });
}