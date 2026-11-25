"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSavedLessons } from "@/lib/local";
import { LessonPlanSchema, type LessonPlan } from "@/lib/schema";
import {
  getDemoClassDict,
  getDict,
  getHelpDict,
  getLiveDict,
  t,
  type Locale,
} from "@/lib/i18n";
import type { HelpRecord } from "@/lib/lesson-report";
import { buildHelpQueue, type StudentRow } from "@/lib/help-queue";
import { cardNumber, groupTitle, segmentAt } from "@/lib/lesson";
import { enableSound } from "@/lib/lesson-signal";
import { finishRun, pauseRun, shiftRun, startRun } from "@/lib/run-controls";
import { useLessonClock, formatClock } from "./useLessonClock";
import { useClassroomStudents, useDemoClass } from "./useClassroomStudents";
import { RunSync } from "./RunSync";
import { LessonReport } from "./LessonReport";
import { modeBlock } from "./modes";

/** Local credentials unlock an authenticated endpoint, rather than exposing a controller from a public URL. */
export function LiveLesson({
  lessonId,
  lang,
}: {
  lessonId: string;
  lang: Locale;
}) {
  const token = useSavedLessons().find((l) => l.id === lessonId)?.token;
  const [data, setData] = useState<{
    plan: LessonPlan;
    isDemo: boolean;
  } | null>(null);
  const [error, setError] = useState(false);
  const d = getLiveDict(lang);
  useEffect(() => {
    if (!token) return;
    const abort = new AbortController();
    void fetch(`/api/lessons/${lessonId}/teacher`, {
      headers: { "x-teacher-token": token },
      signal: abort.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("teacher");
        const result = await r.json();
        setData({
          plan: LessonPlanSchema.parse(result.plan),
          isDemo: result.isDemo === true,
        });
      })
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [lessonId, token]);
  if (!token || !data)
    return (
      <main className="wrap py-8">
        <h1 className="text-2xl font-semibold">{d.title}</h1>
        <p className="my-4">{!token ? d.key : error ? d.denied : d.loading}</p>
        <Link
          href={`/${lang}/teacher/${lessonId}`}
          className="btn btn-secondary min-h-11 px-2 whitespace-normal"
        >
          {d.back}
        </Link>
      </main>
    );
  return (
    <Controller
      key={lessonId}
      lessonId={lessonId}
      token={token}
      plan={data.plan}
      isDemo={data.isDemo}
      lang={lang}
    />
  );
}

function Controller({
  lessonId,
  token,
  plan,
  isDemo,
  lang,
}: {
  lessonId: string;
  token: string;
  plan: LessonPlan;
  isDemo: boolean;
  lang: Locale;
}) {
  const dict = getDict(lang),
    d = getLiveDict(lang),
    hd = getHelpDict(lang),
    demo = getDemoClassDict(lang);
  const clock = useLessonClock(lessonId, plan);
  const { start: demoStart, toggle: toggleDemo } = useDemoClass(lessonId);
  const { students, offline, sampleTime, demoNow, helped } =
    useClassroomStudents(lessonId, token, plan, demoStart);
  const [report, setReport] = useState<{
    rows: StudentRow[];
    history: HelpRecord[];
  } | null>(null);
  const history = useRef(new Map<string, HelpRecord>());
  useEffect(() => {
    for (const student of students ?? [])
      if (student.needsHelp && student.helpCard)
        history.current.set(`${student.id}:${student.helpCard}`, {
          studentId: student.id,
          name: student.name,
          groupId: student.groupId,
          cardId: student.helpCard,
        });
  }, [students]);
  const queue = buildHelpQueue(
    students ?? [],
    plan,
    Math.max(sampleTime, demoNow),
    clock.state ? clock.minute : undefined,
  );
  return (
    <main
      className="mx-auto grid max-w-3xl gap-3 p-3 sm:p-5"
      aria-label={d.title}
    >
      <RunSync lessonId={lessonId} token={token} lang={lang} />
      <header className="flex min-h-11 items-center justify-between gap-2">
        <Link
          href={`/${lang}/teacher/${lessonId}`}
          className="btn btn-secondary min-h-11 px-2 whitespace-normal"
        >
          {d.back}
        </Link>
        <h1 className="font-semibold">{d.title}</h1>
        <button
          type="button"
          className="btn btn-secondary min-h-11 min-w-11 px-2"
          aria-label={clock.sound ? dict.run.soundOn : dict.run.soundOff}
          aria-pressed={clock.sound}
          onClick={() => enableSound(!clock.sound)}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-5"
          >
            <path d="M11 5 6 9H3v6h3l5 4z" />
            {clock.sound ? (
              <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
            ) : (
              <path d="m16 9 5 6m0-6-5 6" />
            )}
          </svg>
        </button>
      </header>
      <div className="flex items-center justify-between">
        <p className="font-mono text-5xl font-semibold tabular-nums">
          {formatClock(clock.elapsed)}
        </p>
        <p className="text-sm text-muted">
          {clock.ended
            ? dict.run.ended
            : clock.state?.pausedAt
              ? dict.run.paused
              : t(dict.lesson.duration, { n: plan.durationMin })}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-11 px-2 whitespace-normal"
          onClick={() =>
            clock.state ? pauseRun(lessonId) : startRun(lessonId)
          }
        >
          {!clock.state
            ? dict.teacher.run
            : clock.state.pausedAt
              ? dict.run.resume
              : dict.run.pause}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-11 px-2 whitespace-normal"
          aria-label={dict.run.later}
          disabled={!clock.state}
          onClick={() => shiftRun(lessonId, -60000)}
        >
          +1
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-11 px-2 whitespace-normal"
          disabled={!clock.state}
          onClick={() => {
            if (window.confirm(dict.run.stopConfirm)) {
              finishRun(lessonId);
              setReport({
                rows: students ?? [],
                history: [...history.current.values()],
              });
            }
          }}
        >
          {dict.run.stop}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {plan.groups.map((g) => {
          const segment = segmentAt(plan, g.id, clock.minute);
          const next = plan.timeline
            .filter((s) => s.groupId === g.id && s.startMin > clock.minute)
            .sort((a, b) => a.startMin - b.startMin)[0];
          const own = (students ?? []).filter((s) => s.groupId === g.id);
          const struggling = own.filter(
            (s) =>
              s.needsHelp ||
              Object.values(s.cards).some(
                (c) => c.status === "todo" && c.attempts >= 3,
              ),
          );
          const stuckIds = new Set(struggling.map((s) => s.id));
          const stuck = struggling.length;
          return (
            <article
              key={g.id}
              className={`rounded-card p-3 ${segment ? modeBlock[segment.mode] : "bg-surface"}`}
            >
              <div className="flex justify-between gap-2 font-semibold text-sm">
                <h2>
                  {groupTitle(plan.groups, g, dict.common)} ·{" "}
                  {segment ? dict.modes[segment.mode] : dict.run.ended}
                </h2>
                <span className="font-mono">
                  {segment
                    ? formatClock(segment.endMin * 60000 - clock.elapsed)
                    : "0:00"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-snug">
                {segment?.activity}
              </p>
              <p className="mt-1 truncate text-xs">
                {next
                  ? t(d.next, { mode: dict.modes[next.mode] })
                  : dict.run.ended}
              </p>
              <p className="mt-1 text-xs font-semibold">
                {t(d.counts, {
                  solving: own.filter(
                    (s) =>
                      !stuckIds.has(s.id) &&
                      g.cards.some(
                        (c) =>
                          !s.cards[c.id] || s.cards[c.id].status === "todo",
                      ),
                  ).length,
                  stuck,
                })}
                {demoStart !== null &&
                own.some((s) => s.id.startsWith("demo-student-"))
                  ? ` · ${demo.label}`
                  : ""}
              </p>
            </article>
          );
        })}
      </div>
      <section aria-label={hd.title}>
        <h2 className="font-semibold">{hd.title}</h2>
        {queue.length ? (
          <ul className="mt-2 grid gap-2">
            {queue.slice(0, 2).map((item) => {
              const group = plan.groups.find((g) => g.id === item.groupId)!;
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-card border border-line px-3 py-2 text-sm"
                >
                  <p>
                    {t(hd[item.reason], {
                      name: item.name ?? "",
                      n: cardNumber(group, item.cardId) ?? "",
                      m: item.waitMinutes,
                      grade: groupTitle(plan.groups, group, dict.common),
                      count: item.count,
                      total: item.total,
                    })}
                    {item.studentId?.startsWith("demo-student-")
                      ? ` · ${demo.label}`
                      : ""}
                  </p>
                  {item.studentId && item.reason === "requested" && (
                    <button
                      type="button"
                      className="btn btn-secondary min-h-11 max-w-24 shrink-0 px-2 text-xs whitespace-normal"
                      onClick={() => void helped(item.studentId!)}
                    >
                      {dict.teacher.helped}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">{d.empty}</p>
        )}
        {queue.length > 2 && (
          <Link
            className="inline-flex min-h-11 items-center text-sm underline"
            href={`/${lang}/teacher/${lessonId}#students`}
          >
            {t(d.more, { n: queue.length - 2 })}
          </Link>
        )}
      </section>
      {offline && (
        <p role="status" className="text-sm">
          {dict.teacher.offline}
        </p>
      )}
      {isDemo && (
        <button
          type="button"
          className="btn btn-secondary min-h-11 px-2 whitespace-normal"
          aria-pressed={demoStart !== null}
          onClick={toggleDemo}
        >
          {demoStart === null ? demo.start : demo.stop}
        </button>
      )}
      {report && (
        <LessonReport
          plan={plan}
          students={report.rows}
          lang={lang}
          history={report.history}
          onClose={() => setReport(null)}
        />
      )}
    </main>
  );
}
