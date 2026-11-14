// The drawing of an exercise: two frames, one at each end of the movement, crossfaded three times and then
// left at rest. With "reduce motion" on, both frames are shown side by side and nothing moves.
//
// Three cycles of 1.6 s is 4.8 s: under the five seconds after which moving content needs a pause control.
// Opening the Cues panel mounts this again, which is how a lifter replays it.

import Link from "next/link";
import { CREDITS_COPY } from "@/src/lib/creditsCopy";
import { illustrationFor } from "@/src/lib/exerciseIllustrations";
import styles from "./ExerciseIllustration.module.css";

export function ExerciseIllustration({ name }: { name: string }) {
  const illustration = illustrationFor(name);
  if (illustration === null) return null;
  const { slug, size } = illustration;
  return (
    <figure
      className={styles.figure}
      role="img"
      aria-label={`Drawing of the ${name}, showing both ends of the movement`}
    >
      <div className={styles.frames}>
        {[1, 2].map((n) => (
          // The drawings are already sized and compressed (scripts/illustrations/build.ts), so next/image adds nothing.
          <img
            key={n}
            src={`/exercises/${slug}-${n}.webp`}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            className={n === 1 ? styles.frameOne : styles.frameTwo}
          />
        ))}
      </div>
      <figcaption className={styles.caption}>
        <Link href="/credits">{CREDITS_COPY.caption}</Link>
      </figcaption>
    </figure>
  );
}
