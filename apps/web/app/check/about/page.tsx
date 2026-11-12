// apps/web/app/check/about/page.tsx — what the Program Checker does and does not judge.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isCheckPublic } from "@training/config";
import { CHECK_COPY } from "@training/domain";
import { CheckNav } from "../CheckNav";
import styles from "../check.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: CHECK_COPY.aboutTitle,
  description: CHECK_COPY.pageDescription,
};

export default function CheckAboutPage() {
  if (!isCheckPublic()) notFound();
  return (
    <>
      <CheckNav />
      <main className={styles.page}>
        <h1 className={styles.heading}>{CHECK_COPY.aboutTitle}</h1>
        <div className={styles.prose}>
          <p>{CHECK_COPY.aboutWhat}</p>
          <p>{CHECK_COPY.aboutIntro}</p>
          <p>{CHECK_COPY.aboutReview}</p>
          <p>{CHECK_COPY.aboutNotJudgedHeading}</p>
          <ul>
            {CHECK_COPY.aboutNotJudged.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>{CHECK_COPY.aboutPain}</p>
          <p>{CHECK_COPY.aboutProvisional}</p>
        </div>
        <Link href="/check" className={styles.primary}>
          {CHECK_COPY.aboutContinue}
        </Link>
      </main>
    </>
  );
}
