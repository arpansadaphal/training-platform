"use client";
import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    throw new Error("sentry-client-phase0-test");
  }, []);
  return <div>test</div>;
}