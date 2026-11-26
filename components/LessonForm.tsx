"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LessonRequestSchema } from "@/lib/generation-schema";
import { NEXT_LESSON_KEY } from "@/lib/next-lesson";
import { parseLessonPlan } from "@/lib/validate";
import { getCreationDict, getDict, t, type Locale } from "@/lib/i18n";
import {
  forgetPending,
  readPending,
  rememberLesson,
  rememberPending,
  type PendingLesson,
} from "@/lib/local";
import type { JobView, LessonProgress } from "@/lib/progress";
import type { Rooms } from "@/lib/schema";
import { initialProgress } from "@/lib/progress";
import { LessonBuilding } from "./LessonBuilding";
import { CurriculumPicker } from "./CurriculumPicker";
import { AutoTextarea } from "./AutoTextarea";

type Photo = { mimeType: "image/jpeg"; data: string; preview: string };
type GroupDraft = {
  id: number;
  grade: number;
  language: Locale;
  topic: string;
  quarter?: number;
  count: string;
  notes: string;
  pages: string;
  photos: Photo[];
  /** Блоки «Учебник» и «Заметка о классе» раскрыты. */
  showTextbook: boolean;
  showNotes: boolean;
};

const MAX_PHOTOS = 2;
/** Как часто спрашиваем сервер о сборке урока. */
const POLL_MS = 2500;

/**
 * Фото страницы учебника сжимаем в браузере: телефон снимает 3–8 МБ, а модели хватает ~1600 px по длинной стороне.
 * Так запрос с шестью фото укладывается в лимит Vercel (4,5 МБ) и не тратит интернет сельской школы.
 */
async function compressPhoto(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file);
  for (const [side, quality] of [
    [1600, 0.72],
    [1280, 0.6],
    [1000, 0.5],
  ] as const) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", quality);
    const data = url.slice(url.indexOf(",") + 1);
    if (data.length <= 850_000)
      return { mimeType: "image/jpeg", data, preview: url };
  }
  throw new Error("too large");
}

const GRADES = Array.from({ length: 11 }, (_, i) => i + 1);
const COUNTS = [1, 2, 3, 4] as const;

function newGroup(id: number, grade: number, language: Locale): GroupDraft {
  return {
    id,
    grade,
    language,
    topic: "",
    count: "",
    notes: "",
    pages: "",
    photos: [],
    showTextbook: false,
    showNotes: false,
  };
}

/**
 * Форма урока: Zod на клиенте → POST /api/lessons → parseLessonPlan.
 * Сервер сохраняет урок в базу и отдаёт id и ключ учителя: открываем страницу урока по ссылке.
 * Если база недоступна, урок показывается из sessionStorage этой вкладки, как раньше.
 * Классов от одного до четырёх, класс можно выбрать дважды (две группы одного класса),
 * у каждого класса свой язык обучения. Учебник и заметка о классе свёрнуты: они нужны не всегда.
 */
export function LessonForm({ lang }: { lang: Locale }) {
  const d = getCreationDict(lang);
  const dict = getDict(lang);
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState("45");
  // Где сидят классы: в одном кабинете (общее начало и итог) или в разных (общих этапов нет).
  const [rooms, setRooms] = useState<Rooms>("one");
  const [groups, setGroups] = useState<GroupDraft[]>([
    newGroup(1, 2, lang),
    newGroup(2, 4, lang),
  ]);
  const [busy, setBusy] = useState(false);
  // Сборка урока на сервере: номер, ход и время. resumed: вернулись к сборке после перезагрузки страницы.
  const [job, setJob] = useState<PendingLesson | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [offline, setOffline] = useState(false);
  const [resumed, setResumed] = useState(false);
  const buildingRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<keyof typeof d.errors | null>(null);
  const [photoError, setPhotoError] = useState<number | null>(null);
  const mixed = new Set(groups.map((g) => g.language)).size > 1;

  async function addPhotos(groupId: number, files: FileList | null) {
    setPhotoError(null);
    const group = groups.find((g) => g.id === groupId);
    if (!files || !group) return;
    const room = MAX_PHOTOS - group.photos.length;
    try {
      const added = await Promise.all(
        [...files].slice(0, room).map(compressPhoto),
      );
      setGroups((items) =>
        items.map((g) =>
          g.id === groupId
            ? { ...g, photos: [...g.photos, ...added].slice(0, MAX_PHOTOS) }
            : g,
        ),
      );
    } catch {
      setPhotoError(groupId);
    }
  }

  // Сборка урока идёт на сервере: спрашиваем, что готово, пока урок не готов или не сломался.
  // Номер сборки лежит в браузере (rememberPending): после обрыва связи или закрытой вкладки форма вернётся к ней.
  /* eslint-disable react-hooks/set-state-in-effect -- Browser storage is available only after hydration; restore a validated draft once. */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(NEXT_LESSON_KEY);
      if (raw) {
        sessionStorage.removeItem(NEXT_LESSON_KEY);
        const draft = LessonRequestSchema.safeParse(JSON.parse(raw));
        if (draft.success) {
          setSubject(draft.data.subject);
          setDuration(String(draft.data.durationMin));
          setRooms(draft.data.rooms ?? "one");
          setGroups(
            draft.data.groups.map((g, i) => ({
              ...newGroup(i + 1, g.grade, g.language ?? draft.data.language),
              topic: g.topic,
              quarter: g.quarter,
              notes: g.notes ?? "",
              count: g.studentCount ? String(g.studentCount) : "",
              showNotes: !!g.notes,
            })),
          );
          return;
        }
      }
    } catch {
      /* A blocked storage or stale draft must not prevent a fresh lesson. */
    }
    const pending = readPending();
    if (!pending) return;
    // Возврат к сборке после перезагрузки: состояние берём из браузера один раз, при открытии формы.
    setJob(pending);
    setResumed(true);
    setBusy(true);
    // Форма снова показывает, что собирается: предмет, длительность, классы и темы.
    setSubject(pending.subject);
    setDuration(String(pending.durationMin));
    setRooms(pending.rooms ?? "one");
    if (pending.draft?.length)
      setGroups(
        pending.draft.map((g, i) => ({
          ...newGroup(i + 1, g.grade, g.language),
          ...g,
        })),
      );
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!job) return;
    let stopped = false;
    const finish = (code: keyof typeof d.errors | null) => {
      stopped = true;
      forgetPending();
      setJob(null);
      setBusy(false);
      if (code) setError(code);
    };
    const poll = async () => {
      try {
        const response = await fetch(`/api/lessons/jobs/${job.job}`, {
          headers: { "x-teacher-token": job.token },
          cache: "no-store",
        });
        if (stopped) return;
        if (response.status === 404) return finish("provider");
        if (!response.ok) return setOffline(true);
        const view = (await response.json()) as JobView;
        setOffline(false);
        setProgress(view.progress);
        setElapsed(view.elapsed);
        if (view.status === "ready" && view.lessonId) {
          rememberLesson({
            id: view.lessonId,
            token: job.token,
            subject: job.subject,
            grades: job.grades,
            language: job.language,
            demo: false,
          });
          stopped = true;
          forgetPending();
          // Урок открываем сверху: иначе браузер оставит прокрутку длинной формы, и урок откроется с середины.
          window.scrollTo(0, 0);
          router.push(`/${lang}/teacher/${view.lessonId}`);
        } else if (view.status === "failed") {
          finish(
            Object.hasOwn(d.errors, view.error ?? "")
              ? (view.error as keyof typeof d.errors)
              : "provider",
          );
        } else if (view.stale) {
          finish("provider");
        }
      } catch {
        if (!stopped) setOffline(true);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    // Секундомер между опросами: сервер присылает точное время раз в несколько секунд.
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [job, lang, router, d]);

  // Ошибка появляется у кнопки, а на телефоне учитель смотрит на блок сборки выше формы: подводим к тексту ошибки.
  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({
      block: "center",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const input = LessonRequestSchema.safeParse({
      subject: subject.trim(),
      // Язык урока — язык первого класса; у каждого класса свой язык в groups[].language.
      language: groups[0].language,
      durationMin: Number(duration),
      // Выбор кабинета имеет смысл только для двух и больше классов.
      ...(groups.length > 1 && rooms === "separate" ? { rooms } : {}),
      groups: groups.map((g) => ({
        grade: g.grade,
        topic: g.topic.trim(),
        ...(g.quarter ? { quarter: g.quarter } : {}),
        language: g.language,
        ...(g.count ? { studentCount: Number(g.count) } : {}),
        ...(g.notes.trim() ? { notes: g.notes.trim() } : {}),
        ...(g.pages.trim() ? { pages: g.pages.trim() } : {}),
        ...(g.photos.length
          ? {
              photos: g.photos.map(({ mimeType, data }) => ({
                mimeType,
                data,
              })),
            }
          : {}),
      })),
    });
    if (!input.success) {
      setError("bad_request");
      return;
    }
    setBusy(true);
    setProgress(null);
    setElapsed(0);
    setResumed(false);
    // На телефоне блок сборки стоит под длинной формой: показываем его, иначе кажется, что ничего не происходит.
    requestAnimationFrame(() =>
      buildingRef.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      }),
    );
    let started = false;
    try {
      const response = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(
          Object.hasOwn(d.errors, result.error) ? result.error : "provider",
        );
        return;
      }
      // Сборка в фоне: дальше форма спрашивает статус (эффект выше).
      if (typeof result.job === "string" && typeof result.token === "string") {
        const pending: PendingLesson = {
          job: result.job,
          token: result.token,
          subject: input.data.subject,
          grades: input.data.groups.map((g) => g.grade),
          language: input.data.language,
          durationMin: input.data.durationMin,
          ...(input.data.rooms ? { rooms: input.data.rooms } : {}),
          startedAt: Date.now(),
          draft: groups.map(
            ({ grade, language, topic, count, notes, pages, quarter }) => ({
              grade,
              language,
              topic,
              count,
              notes,
              pages,
              quarter,
            }),
          ),
        };
        rememberPending(pending);
        setJob(pending);
        started = true;
        return;
      }
      const plan = parseLessonPlan(result.plan);
      if (!plan.ok) {
        setError("invalid_plan");
        return;
      }
      if (typeof result.id === "string" && typeof result.token === "string") {
        rememberLesson({
          id: result.id,
          token: result.token,
          subject: plan.plan.subject,
          grades: plan.plan.groups.map((g) => g.grade),
          language: plan.plan.language,
          demo: result.demo === true,
        });
        window.scrollTo(0, 0);
        router.push(`/${lang}/teacher/${result.id}`);
        return;
      }
      try {
        sessionStorage.setItem(
          "aulsabaq-preview",
          JSON.stringify({ plan: plan.plan, demo: result.demo === true }),
        );
      } catch {
        setError("storage");
        return;
      }
      router.push(`/${lang}/teacher/preview`);
    } catch {
      setError("provider");
    } finally {
      if (!started) setBusy(false);
    }
  }

  function update(id: number, patch: Partial<GroupDraft>) {
    setGroups((items) =>
      items.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    );
  }

  /** Сколько классов в кабинете: лишние группы с конца убираем, новые берут язык последней группы. */
  function setCount(n: number) {
    setGroups((gs) => {
      if (n <= gs.length) return gs.slice(0, n);
      const added: GroupDraft[] = [];
      let id = Math.max(...gs.map((g) => g.id));
      const last = gs[gs.length - 1];
      for (let i = gs.length; i < n; i++) {
        const used = [...gs, ...added].map((g) => g.grade);
        added.push(
          newGroup(
            ++id,
            GRADES.find((k) => k > last.grade && !used.includes(k)) ??
              last.grade,
            last.language,
          ),
        );
      }
      return [...gs, ...added];
    });
  }

  const chip =
    "min-h-10 rounded-full border border-line px-3.5 text-[0.88rem] font-medium transition-colors hover:border-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white";
  const segment =
    "grid min-h-10 cursor-pointer place-items-center rounded-[6px] px-3 text-[0.92rem] font-semibold text-muted transition-colors peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink hover:text-ink peer-checked:hover:text-white";

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
      <form onSubmit={submit} className="min-w-0 lg:col-span-7" noValidate>
        <fieldset
          disabled={busy}
          className="grid min-w-0 gap-8 disabled:opacity-60"
        >
          {/* Предмет и длительность */}
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-start">
            <div className="min-w-0">
              <label htmlFor="subject" className="field-label">
                {d.subject}
              </label>
              <AutoTextarea
                id="subject"
                singleLine
                className="field leading-snug"
                placeholder={d.subjectPlaceholder}
                maxLength={100}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                aria-invalid={
                  error === "bad_request" && !subject.trim() ? true : undefined
                }
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {d.subjectChips.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={subject === name}
                    onClick={() => setSubject(name)}
                    className={chip}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="duration" className="field-label">
                {d.duration}
              </label>
              <input
                id="duration"
                className="field tabular"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={2}
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))}
                aria-invalid={
                  error === "bad_request" &&
                  !(Number(duration) >= 30 && Number(duration) <= 90)
                    ? true
                    : undefined
                }
              />
            </div>
          </div>

          {/* Классы в кабинете */}
          <div className="min-w-0">
            <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em]">
              {d.groups}
            </h2>
            <fieldset className="mt-4">
              <legend className="field-label">{d.classCount}</legend>
              <div className="inline-grid grid-cols-4 rounded-btn border border-line-strong p-1">
                {COUNTS.map((n) => (
                  <label key={n} className="relative">
                    <input
                      type="radio"
                      name="class-count"
                      value={n}
                      checked={groups.length === n}
                      onChange={() => setCount(n)}
                      className="peer sr-only"
                    />
                    <span className={`${segment} tabular min-w-12`}>{n}</span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[0.85rem] leading-snug text-muted">
                {d.classCountHint}
              </p>
            </fieldset>

            {groups.length > 1 && (
              <fieldset className="mt-6">
                <legend className="field-label">{d.rooms}</legend>
                <div className="inline-grid grid-cols-2 rounded-btn border border-line-strong p-1">
                  {(["one", "separate"] as const).map((value) => (
                    <label key={value} className="relative">
                      <input
                        type="radio"
                        name="rooms"
                        value={value}
                        checked={rooms === value}
                        onChange={() => setRooms(value)}
                        className="peer sr-only"
                      />
                      <span className={segment}>
                        {value === "one" ? d.roomsOne : d.roomsSeparate}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 max-w-[60ch] text-[0.85rem] leading-snug text-muted" aria-live="polite">
                  {rooms === "one" ? d.roomsOneHint : d.roomsSeparateHint}
                </p>
              </fieldset>
            )}

            <div className="mt-6 grid gap-4">
              {groups.map((group, index) => (
                <section
                  key={group.id}
                  aria-label={t(d.group, { n: index + 1 })}
                  className="min-w-0 rounded-card border border-line bg-surface p-4 sm:p-5"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <h3 className="font-semibold">
                      {t(d.group, { n: index + 1 })}
                    </h3>
                    {groups.length > 1 && (
                      <button
                        type="button"
                        className="link min-h-10 px-1 text-[0.88rem] text-muted hover:text-ink"
                        onClick={() =>
                          setGroups((gs) => gs.filter((g) => g.id !== group.id))
                        }
                      >
                        {d.remove}
                      </button>
                    )}
                  </div>

                  <fieldset className="min-w-0">
                    <legend className="field-label">{d.grade}</legend>
                    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
                      {GRADES.map((n) => (
                        <label key={n}>
                          <input
                            type="radio"
                            name={`grade-${group.id}`}
                            value={n}
                            checked={group.grade === n}
                            onChange={() => update(group.id, { grade: n })}
                            className="peer sr-only"
                          />
                          <span className="tabular grid min-h-11 cursor-pointer place-items-center rounded-btn border border-line bg-white font-semibold transition-colors hover:border-ink peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                            {n}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="mt-4">
                    <legend className="field-label">{d.language}</legend>
                    <div className="inline-grid grid-cols-2 rounded-btn border border-line-strong bg-white p-1">
                      {(["kk", "ru"] as const).map((code) => (
                        <label key={code} className="relative">
                          <input
                            type="radio"
                            name={`language-${group.id}`}
                            value={code}
                            checked={group.language === code}
                            onChange={() =>
                              update(group.id, { language: code })
                            }
                            className="peer sr-only"
                          />
                          <span lang={code} className={segment}>
                            {d.languageNames[code]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-start">
                    <div className="min-w-0">
                      <label
                        htmlFor={`topic-${group.id}`}
                        className="field-label"
                      >
                        {d.topic}
                      </label>
                      <AutoTextarea
                        id={`topic-${group.id}`}
                        singleLine
                        className="field leading-snug"
                        placeholder={d.topicPlaceholder}
                        maxLength={300}
                        value={group.topic}
                        onChange={(e) =>
                          update(group.id, { topic: e.target.value })
                        }
                        aria-invalid={
                          error === "bad_request" && !group.topic.trim()
                            ? true
                            : undefined
                        }
                      />
                      <CurriculumPicker key={`${subject}-${group.grade}-${group.language}-${group.quarter}`} subject={subject} grade={group.grade}
                        language={group.language} quarter={group.quarter}
                        onQuarter={(quarter) => update(group.id, { quarter })}
                        onTopic={(topic) => update(group.id, { topic })} />
                    </div>
                    <div>
                      <label
                        htmlFor={`count-${group.id}`}
                        className="field-label"
                      >
                        {d.count}
                      </label>
                      <input
                        id={`count-${group.id}`}
                        className="field tabular"
                        placeholder={d.countPlaceholder}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={3}
                        value={group.count}
                        onChange={(e) =>
                          update(group.id, {
                            count: e.target.value.replace(/\D/g, ""),
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Необязательное: раскрывается по нажатию, чтобы форма не была длинной */}
                  <p className="mt-4 text-[0.85rem] text-muted">{d.optional}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        ["showTextbook", d.textbook, `textbook-${group.id}`],
                        ["showNotes", d.notes, `notes-box-${group.id}`],
                      ] as const
                    ).map(([key, label, controls]) => (
                      <button
                        key={key}
                        type="button"
                        aria-expanded={group[key]}
                        aria-controls={controls}
                        onClick={() => update(group.id, { [key]: !group[key] })}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-white px-3.5 text-left text-[0.88rem] font-medium transition-colors hover:border-ink aria-expanded:border-ink"
                      >
                        <svg
                          aria-hidden
                          viewBox="0 0 16 16"
                          className={`size-3.5 transition-transform ${group[key] ? "rotate-45" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                        >
                          <path d="M8 3v10M3 8h10" />
                        </svg>
                        {label}
                      </button>
                    ))}
                  </div>

                  {group.showTextbook && (
                    <div
                      id={`textbook-${group.id}`}
                      className="mt-3 rounded-btn border border-line bg-white p-3 sm:p-4"
                    >
                      <p className="text-[0.85rem] leading-snug text-muted">
                        {d.textbookHint}
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div className="w-36">
                          <label
                            htmlFor={`pages-${group.id}`}
                            className="field-label"
                          >
                            {d.pages}
                          </label>
                          <input
                            id={`pages-${group.id}`}
                            className="field"
                            maxLength={40}
                            placeholder={d.pagesPlaceholder}
                            value={group.pages}
                            onChange={(e) =>
                              update(group.id, { pages: e.target.value })
                            }
                          />
                        </div>
                        {group.photos.map((photo, k) => (
                          <div key={k} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element -- предпросмотр из памяти браузера, next/image не нужен */}
                            <img
                              src={photo.preview}
                              alt={t(d.photoAlt, { n: k + 1 })}
                              className="h-12 w-12 rounded-btn border border-line object-cover"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                update(group.id, {
                                  photos: group.photos.filter(
                                    (_, i) => i !== k,
                                  ),
                                })
                              }
                              aria-label={t(d.removePhoto, { n: k + 1 })}
                              className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-ink text-white"
                            >
                              <svg
                                aria-hidden
                                viewBox="0 0 24 24"
                                className="size-3.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                              >
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                        {group.photos.length < MAX_PHOTOS && (
                          <label className="btn btn-secondary btn-sm cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
                            <svg
                              aria-hidden
                              viewBox="0 0 24 24"
                              className="size-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                              <circle cx="12" cy="13" r="3" />
                            </svg>
                            {d.addPhoto}
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              className="sr-only"
                              onChange={(e) => {
                                void addPhotos(group.id, e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                      {photoError === group.id && (
                        <p
                          role="alert"
                          className="mt-2 text-[0.88rem] text-danger"
                        >
                          {d.photoError}
                        </p>
                      )}
                    </div>
                  )}

                  {group.showNotes && (
                    <div id={`notes-box-${group.id}`} className="mt-3">
                      <label htmlFor={`notes-${group.id}`} className="sr-only">
                        {d.notes}
                      </label>
                      <AutoTextarea
                        id={`notes-${group.id}`}
                        className="field min-h-0 leading-snug"
                        minRows={2}
                        maxLength={300}
                        placeholder={d.notesPlaceholder}
                        value={group.notes}
                        onChange={(e) =>
                          update(group.id, { notes: e.target.value })
                        }
                      />
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        </fieldset>

        {error && (
          <div
            ref={errorRef}
            role="alert"
            className="mt-6 flex scroll-mt-24 gap-3 rounded-card border border-danger/30 bg-danger-soft p-4 text-ink"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="mt-0.5 size-5 shrink-0 text-danger"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5v.5" />
            </svg>
            <p className="leading-snug">{d.errors[error]}</p>
          </div>
        )}

        <div className="mt-8 grid gap-3">
          {/* Во время сборки кнопка не гаснет, как запрещённая: она полного цвета, с крутилкой, и повторно не отправляет. */}
          <button
            type="submit"
            aria-disabled={busy}
            aria-busy={busy}
            className="btn btn-primary w-full"
          >
            {busy && (
              <span
                aria-hidden
                className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
              />
            )}
            {busy ? d.loading : d.submit}
            {!busy && (
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="arrow size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 8h10M8.5 4l4 4-4 4" />
              </svg>
            )}
          </button>
          <Link
            className="link mx-auto py-2 text-[0.92rem] text-muted hover:text-ink"
            href={`/${lang}/teacher/demo`}
          >
            {d.demo}
          </Link>
        </div>
      </form>

      {/* Предпросмотр: дорожки выбранных классов, а во время сборки настоящий ход сборки урока */}
      {/* Пока урок собирается, на телефоне ход сборки стоит над формой: смотреть больше не на что. */}
      <aside
        ref={buildingRef}
        aria-live="polite"
        className={`scroll-mt-20 lg:col-span-5 ${busy ? "max-lg:order-first" : ""}`}
      >
        <div className="rounded-frame bg-stage p-5 sm:p-6 lg:sticky lg:top-24">
          <div className="rounded-card bg-white p-5">
            {busy ? (
              <LessonBuilding
                lang={lang}
                grades={job?.grades ?? groups.map((g) => g.grade)}
                durationMin={job?.durationMin ?? (Number(duration) || 45)}
                rooms={job ? job.rooms ?? "one" : groups.length > 1 ? rooms : "one"}
                progress={
                  progress ??
                  initialProgress(job?.grades.length ?? groups.length)
                }
                elapsed={elapsed}
                offline={offline}
                resumed={resumed}
              />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{d.previewTitle}</p>
                  <span className="font-mono text-[0.8rem] text-faint">
                    {subject.trim() || "…"}
                  </span>
                </div>
                <div className="mt-5 grid gap-2.5">
                  {groups.map((g) => (
                    <div
                      key={g.id}
                      className="grid grid-cols-[minmax(4.5rem,auto)_1fr] items-center gap-3"
                    >
                      <span className="text-[0.85rem] font-semibold whitespace-nowrap">
                        {t(dict.common.grade, { n: g.grade })}
                        {mixed && (
                          <span className="ml-1.5 font-normal text-muted uppercase">
                            {g.language}
                          </span>
                        )}
                      </span>
                      <span className="h-9 rounded-md border border-dashed border-line-strong" />
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-[0.88rem] text-muted">
                  {d.previewEmpty}
                </p>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
