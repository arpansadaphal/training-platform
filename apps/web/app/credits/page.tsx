// apps/web/app/credits/page.tsx — who made what the app shows. Public, no sign-in.

import type { Metadata } from "next";
import Link from "next/link";
import { CREDITS_COPY as copy, CREDITS_LINKS as links } from "@/src/lib/creditsCopy";

export const metadata: Metadata = { title: copy.title };

export default function CreditsPage() {
  return (
    <>
      <nav>
        <Link href="/">
          <strong>Training Platform</strong>
        </Link>
      </nav>
      <main>
        <h1>{copy.title}</h1>
        <h2>{copy.drawingsHeading}</h2>
        <p>{copy.drawingsBody}</p>
        <ul>
          <li>
            <a href={links.source}>{copy.sourceLabel}</a>
          </li>
          <li>
            <a href={links.license}>{copy.licenseLabel}</a>
          </li>
        </ul>
        <h2>{copy.changesHeading}</h2>
        <p>{copy.changesBody}</p>
        <h2>{copy.matchingHeading}</h2>
        <p>{copy.matchingBody}</p>
        <h2>{copy.shareAlikeHeading}</h2>
        <p>{copy.shareAlikeBody}</p>
        <ul>
          <li>
            <a href={links.repository}>{copy.repositoryLabel}</a>
          </li>
        </ul>
      </main>
    </>
  );
}
