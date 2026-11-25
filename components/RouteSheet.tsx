"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Group, LessonPlan } from "@/lib/schema";
import { classRoute } from "@/lib/route-sheet";
import { groupTitle } from "@/lib/lesson";
import {
  getCurriculumDict,
  getDict,
  getRouteSheetDict,
  t,
  type Locale,
} from "@/lib/i18n";

export function RouteSheetButton({
  plan,
  group,
  lang,
}: {
  plan: LessonPlan;
  group: Group;
  lang: Locale;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn btn-secondary mt-3 min-h-11 print:hidden"
        onClick={() => setOpen(true)}
      >
        {getRouteSheetDict(lang).title}
      </button>
      {open && (
        <RouteSheet
          plan={plan}
          group={group}
          lang={group.language ?? plan.language}
          onClose={close}
        />
      )}
    </>
  );
}

/** A portal makes the paper sheet a direct body child, so print CSS can exclude every other screen. */
function RouteSheet({
  plan,
  group,
  lang,
  onClose,
}: {
  plan: LessonPlan;
  group: Group;
  lang: Locale;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const d = getRouteSheetDict(lang),
    dict = getDict(lang),
    curriculum = getCurriculumDict(lang);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-label={d.title}
      className="route-sheet-dialog fixed inset-0 m-auto max-h-[95dvh] w-[min(96vw,52rem)] overflow-auto rounded-card border border-line bg-white p-4 shadow-xl"
    >
      <div className="mb-4 flex flex-wrap justify-between gap-2 print:hidden">
        <button
          type="button"
          className="btn btn-primary min-h-11"
          onClick={() => window.print()}
        >
          {d.print}
        </button>
        <button
          type="button"
          className="btn btn-secondary min-h-11"
          onClick={onClose}
        >
          {d.close}
        </button>
      </div>
      <article
        className="route-sheet-page mx-auto max-w-[186mm] text-ink"
        aria-label={groupTitle(plan.groups, group, dict.common)}
      >
        <header className="border-b-2 border-ink pb-3">
          <p className="text-sm font-semibold">AulSabaq · {d.title}</p>
          <h2 className="mt-1 text-xl font-semibold">
            {groupTitle(plan.groups, group, dict.common)} · {plan.subject}
          </h2>
          <p className="mt-1 font-medium">{group.topic}</p>
          <p className="mt-2 text-sm">
            {d.name} __________________________________
          </p>
        </header>
        <section className="mt-4">
          <h3 className="font-semibold">{d.route}</h3>
          <ol className="mt-2 grid gap-2">
            {classRoute(plan, group.id).map((line) => (
              <li
                key={line.start}
                className="grid grid-cols-[6rem_1fr] gap-3 border-b border-line pb-2 text-sm"
              >
                <span className="font-mono">
                  {t(d.interval, { start: line.start, end: line.end })}
                </span>
                <span>
                  <strong>{dict.modes[line.mode]}</strong>
                  {line.cards.length
                    ? `: ${t(dict.run.cards, { list: line.cards.join(", ") })}`
                    : ""}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="mt-4">
          <h3 className="font-semibold">{d.rule}</h3>
          <p className="mt-1 text-sm leading-snug">
            {group.explanation.keyIdea}
          </p>
        </section>
        <section className="mt-4">
          <h3 className="font-semibold">{d.check}</h3>
          <ol className="mt-1 list-inside list-decimal text-sm leading-relaxed">
            {d.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-2 rounded-card border border-ink p-2 text-sm font-semibold">
            {d.help}
          </p>
        </section>
        <section className="mt-4">
          <h3 className="font-semibold">{d.done}</h3>
          <p className="mt-1 text-xs">{d.order}</p>
          <ol className="route-sheet-checks mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {group.cards.map((card, i) => (
              <li
                key={card.id}
                className="flex items-center gap-2 border border-line p-2 text-sm"
              >
                <span
                  aria-hidden
                  className="inline-block size-3 border border-ink"
                />
                {i + 1}
              </li>
            ))}
          </ol>
        </section>
        {group.curriculumGoals?.length ? (
          <footer className="mt-4 border-t border-line pt-2 text-xs">
            <p>
              <strong>{curriculum.goals}:</strong>{" "}
              {group.curriculumGoals.map((goal) => goal.code).join(", ")}
            </p>
            <p className="mt-1">{curriculum.source}</p>
          </footer>
        ) : null}
      </article>
    </dialog>,
    document.body,
  );
}
