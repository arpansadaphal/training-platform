"use client";

// apps/web/app/check/CheckClient.tsx
//
// Input side of the Program Checker. Everything here is local state and pure domain code:
// the routine is parsed in the browser against the exercise list handed in by the server page, the visitor
// confirms the reading, and "Check my program" navigates to /check/<hash>, where the assessment is computed.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { ExerciseRecord } from "@training/db";
import {
  CHECK_COPY,
  CHECK_PRESETS,
  countResolved,
  decodeCompactProgram,
  encodeCompactProgram,
  mergeAllDays,
  parseRoutine,
  resolvedName,
  toCompactProgram,
  unresolvedLines,
  type ParseResult,
  type ParsedLine,
  type Resolutions,
} from "@training/domain";
import { ExercisePicker } from "@/app/app/programs/[id]/build/ExercisePicker";
import styles from "./check.module.css";

const MIN_EXERCISES = 3;

type Tab = "paste" | "pick";

function prescription(line: ParsedLine): string {
  const reps = line.repHigh === line.repLow ? `${line.repLow}` : `${line.repLow}-${line.repHigh}`;
  return `${line.sets}×${reps}`;
}

function dropRemoved(result: ParseResult, removed: ReadonlySet<number>): ParseResult {
  if (removed.size === 0) return result;
  const days = result.days
    .map((d) => ({ ...d, lines: d.lines.filter((l) => !removed.has(l.lineNo)) }))
    .filter((d) => d.lines.length > 0);
  return { ...result, days };
}

export function CheckClient({ exercises }: { exercises: ExerciseRecord[] }) {
  const router = useRouter();
  const tabsId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const names = useMemo(() => exercises.map((e) => e.name), [exercises]);

  const [tab, setTab] = useState<Tab>("paste");
  const [text, setText] = useState("");
  const [separate, setSeparate] = useState(false);
  const [mergedAll, setMergedAll] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [resolutions, setResolutions] = useState<Resolutions>({});
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const [choosing, setChoosing] = useState<number | null>(null);
  const [tooLarge, setTooLarge] = useState(false);

  const merged = useMemo(() => parseRoutine(text, names), [text, names]);
  const base = useMemo(
    () => (separate ? parseRoutine(text, names, { mergeSingletons: false }) : merged),
    [separate, text, names, merged],
  );
  const parsed = useMemo(
    () => dropRemoved(mergedAll ? mergeAllDays(base) : base, removed),
    [base, mergedAll, removed],
  );

  const unresolved = unresolvedLines(parsed, resolutions);
  const resolvedCount = countResolved(parsed, resolutions);
  const unparsedShown = parsed.unparsed.filter((u) => !dismissed.has(u.lineNo));
  const canCheck = confirmed && unresolved.length === 0 && resolvedCount >= MIN_EXERCISES;
  const hasReading = parsed.days.length > 0;

  function onTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    setSeparate(false);
    setMergedAll(false);
    setConfirmed(false);
    setResolutions({});
    setRemoved(new Set());
    setDismissed(new Set());
    setChoosing(null);
    setTooLarge(false);
  }

  function answer(lineNo: number, name: string) {
    setResolutions((prev) => ({ ...prev, [lineNo]: name }));
    setChoosing(null);
  }

  function checkProgram() {
    const hash = encodeCompactProgram(toCompactProgram(parsed, resolutions));
    if (decodeCompactProgram(hash) === null) {
      setTooLarge(true);
      return;
    }
    router.push(`/check/${hash}`);
  }

  function editManually() {
    setConfirmed(false);
    textareaRef.current?.focus();
  }

  const hint =
    resolvedCount < MIN_EXERCISES
      ? CHECK_COPY.needMoreExercises(MIN_EXERCISES - resolvedCount)
      : unresolved.length > 0
        ? CHECK_COPY.resolveFirst(unresolved.length)
        : !confirmed
          ? CHECK_COPY.confirmFirst
          : null;

  return (
    <main id="input" className={styles.page}>
      <h1 className={styles.heading}>{CHECK_COPY.pageTitle}</h1>
      <p className={styles.lead}>{CHECK_COPY.intro}</p>

      <div role="tablist" aria-label="Input mode" className={styles.tabs}>
        {(
          [
            ["paste", CHECK_COPY.tabPaste],
            ["pick", CHECK_COPY.tabPick],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`${tabsId}-${id}`}
            aria-selected={tab === id}
            aria-controls={`${tabsId}-${id}-panel`}
            className={styles.tab}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "pick" ? (
        <section role="tabpanel" id={`${tabsId}-pick-panel`} aria-labelledby={`${tabsId}-pick`} className={styles.field}>
          <p className={styles.note}>{CHECK_COPY.pickIntro}</p>
          <ul className={styles.cards}>
            {CHECK_PRESETS.map((preset) => (
              <li key={preset.slug}>
                <Link href={`/check/${encodeCompactProgram(preset.program)}`} className={styles.card}>
                  <span className={styles.cardTitle}>{preset.title}</span>
                  <span className={styles.note}>{preset.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section role="tabpanel" id={`${tabsId}-paste-panel`} aria-labelledby={`${tabsId}-paste`} className={styles.field}>
          <label className={styles.field} htmlFor={`${tabsId}-text`}>
            {CHECK_COPY.pasteLabel}
          </label>
          <textarea
            ref={textareaRef}
            id={`${tabsId}-text`}
            className={styles.textarea}
            value={text}
            onChange={onTextChange}
            placeholder={CHECK_COPY.pastePlaceholder}
            spellCheck={false}
            autoCapitalize="off"
          />
          <p className={styles.note}>{CHECK_COPY.assumptionsNote}</p>
          <p className={styles.note}>{CHECK_COPY.layoutHint}</p>
          <p className={styles.note}>{CHECK_COPY.rotationHint}</p>

          {hasReading ? (
            <div className={styles.panel} aria-live="polite">
              <h2 className={styles.panelHeading}>{CHECK_COPY.parsedHeading(parsed.days.length)}</h2>
              <ol className={styles.dayList}>
                {parsed.days.map((day, i) => (
                  <li key={`${day.name}-${i}`}>
                    <span className={styles.dayName}>{CHECK_COPY.parsedDayLine(i + 1, day.name, day.nameAuto)}</span>
                    <ul className={styles.exerciseList}>
                      {day.lines.map((line) => (
                        <li key={line.lineNo}>
                          {resolvedName(line, resolutions) ?? line.query} {prescription(line)}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
              {parsed.restLinesSkipped > 0 ? (
                <p className={styles.note}>{CHECK_COPY.restSkipped(parsed.restLinesSkipped)}</p>
              ) : null}

              {merged.notes.length > 0 && !mergedAll ? (
                <>
                  <p className={styles.note}>{CHECK_COPY.singletonNote(merged.notes[0]!.exerciseCount)}</p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => {
                        setSeparate(!separate);
                        setConfirmed(false);
                      }}
                    >
                      {separate ? CHECK_COPY.singletonMerge : CHECK_COPY.singletonSeparate}
                    </button>
                  </div>
                </>
              ) : null}

              <div className={styles.actions}>
                <button type="button" className={styles.primary} onClick={() => setConfirmed(true)}>
                  {CHECK_COPY.looksRight}
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => {
                    setMergedAll(!mergedAll);
                    setConfirmed(false);
                  }}
                >
                  {mergedAll ? CHECK_COPY.splitAgain : CHECK_COPY.mergeAll}
                </button>
                <button type="button" className={styles.secondary} onClick={editManually}>
                  {CHECK_COPY.editManually}
                </button>
              </div>
              {confirmed ? <p className={styles.note}>{CHECK_COPY.confirmedNote}</p> : null}
            </div>
          ) : null}

          {unresolved.length > 0 ? (
            <div className={styles.panel}>
              <h2 className={styles.panelHeading}>{CHECK_COPY.confirmHeading}</h2>
              {unresolved.map((line) => (
                <div key={line.lineNo} className={styles.lineCard}>
                  <p className={styles.lineText}>
                    {line.match.best !== null
                      ? CHECK_COPY.didYouMean(line.lineNo, line.raw, line.match.best)
                      : CHECK_COPY.noMatch(line.lineNo, line.raw)}
                  </p>
                  <div className={styles.actions}>
                    {line.match.best !== null ? (
                      <button type="button" className={styles.primary} onClick={() => answer(line.lineNo, line.match.best!)}>
                        {CHECK_COPY.yes}
                      </button>
                    ) : null}
                    {line.match.candidates.slice(1, 4).map((name) => (
                      <button key={name} type="button" className={styles.secondary} onClick={() => answer(line.lineNo, name)}>
                        {CHECK_COPY.useCandidate(name)}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setChoosing(choosing === line.lineNo ? null : line.lineNo)}
                    >
                      {CHECK_COPY.chooseDifferent}
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setRemoved((prev) => new Set(prev).add(line.lineNo))}
                    >
                      {CHECK_COPY.removeLine}
                    </button>
                  </div>
                  {choosing === line.lineNo ? (
                    <ExercisePicker
                      exercises={exercises}
                      onSelect={(id) => {
                        const chosen = exercises.find((e) => e.id === id);
                        if (chosen) answer(line.lineNo, chosen.name);
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {unparsedShown.length > 0 ? (
            <div className={styles.panel}>
              <h2 className={styles.panelHeading}>{CHECK_COPY.unparsedHeading}</h2>
              <p className={styles.note}>{CHECK_COPY.unparsedHelp}</p>
              {unparsedShown.map((line) => (
                <div key={line.lineNo} className={styles.lineCard}>
                  <p className={styles.lineText}>
                    Line {line.lineNo}: {line.raw}
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => setDismissed((prev) => new Set(prev).add(line.lineNo))}
                    >
                      {CHECK_COPY.deleteLine}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={!canCheck} onClick={checkProgram}>
              {CHECK_COPY.checkProgram}
            </button>
          </div>
          {hint !== null && text.trim().length > 0 ? <p className={styles.note}>{hint}</p> : null}
          {tooLarge ? (
            <p className={styles.error} role="alert">
              {CHECK_COPY.tooLarge}
            </p>
          ) : null}
        </section>
      )}

      <Link href="/check/about" className={styles.textLink}>
        {CHECK_COPY.aboutLink}
      </Link>
    </main>
  );
}
