import { cardNumbers, timeSlots } from "@/lib/lesson";
import type { Group, LessonPlan, Segment, SegmentMode } from "@/lib/schema";
import { t, type Dict } from "@/lib/i18n";

/**
 * Таймлайн урока.
 * Компьютер: колонки по классам, высота блока = длительность этапа (16px на минуту).
 * Телефон: список промежутков времени — «с 5 по 15 минуту: 2 класс с учителем, 4 класс сам».
 */

const MINUTE_PX = 16;

const blockStyle: Record<SegmentMode, string> = {
  with_teacher: "bg-blue text-white",
  independent: "bg-sand/45 text-ink border border-sand-line/50",
  joint: "bg-ink text-paper",
};

const labelStyle: Record<SegmentMode, string> = {
  with_teacher: "text-white/75",
  independent: "text-ink-soft",
  joint: "text-paper/65",
};

export function LessonTimeline({ plan, dict }: { plan: LessonPlan; dict: Dict }) {
  return (
    <>
      <DesktopTimeline plan={plan} dict={dict} />
      <MobileTimeline plan={plan} dict={dict} />
    </>
  );
}

function DesktopTimeline({ plan, dict }: { plan: LessonPlan; dict: Dict }) {
  const bounds = [...new Set(plan.timeline.flatMap((s) => [s.startMin, s.endMin]))].sort((a, b) => a - b);
  const row = (minute: number) => minute + 2; // строка 1 — заголовки классов

  // Общий этап, который у всех классов в одно и то же время, рисуем одним широким блоком.
  const isSharedJoint = (s: Segment) =>
    s.mode === "joint" &&
    plan.groups.every((g) =>
      plan.timeline.some((o) => o.groupId === g.id && o.mode === "joint" && o.startMin === s.startMin && o.endMin === s.endMin),
    );

  return (
    <div
      className="hidden md:grid"
      style={{
        gridTemplateColumns: `3rem repeat(${plan.groups.length}, minmax(0, 1fr))`,
        gridTemplateRows: `auto repeat(${plan.durationMin}, ${MINUTE_PX}px)`,
      }}
    >
      {plan.groups.map((g, i) => (
        <div key={g.id} className="px-1.5 pb-3" style={{ gridColumn: i + 2, gridRow: 1 }}>
          <p className="font-serif text-xl font-medium text-ink">{t(dict.common.grade, { n: g.grade })}</p>
          <p className="mt-0.5 line-clamp-2 text-[0.82rem] leading-snug text-ink-soft">{g.topic}</p>
        </div>
      ))}

      {bounds.map((b) => (
        <div key={`line-${b}`} className="border-t border-dashed border-rule" style={{ gridColumn: "1 / -1", gridRow: row(b) }} />
      ))}
      {bounds.map((b) => (
        <span
          key={`label-${b}`}
          className="tabular -mt-2.5 text-[0.72rem] leading-none text-ink-faint"
          style={{ gridColumn: 1, gridRow: b === plan.durationMin ? row(b) - 1 : row(b), alignSelf: b === plan.durationMin ? "end" : "start", marginBottom: b === plan.durationMin ? "-0.35rem" : undefined }}
        >
          {b}
        </span>
      ))}

      {plan.groups.map((g, i) =>
        plan.timeline
          .filter((s) => s.groupId === g.id)
          .map((s) => {
            const shared = isSharedJoint(s);
            if (shared && i > 0) return null;
            return (
              <Block
                key={`${g.id}-${s.startMin}`}
                segment={s}
                group={g}
                dict={dict}
                shared={shared}
                style={{
                  gridColumn: shared ? "2 / -1" : i + 2,
                  gridRow: `${row(s.startMin)} / ${row(s.endMin)}`,
                }}
              />
            );
          }),
      )}
    </div>
  );
}

function Block({
  segment,
  group,
  dict,
  shared,
  style,
}: {
  segment: Segment;
  group: Group;
  dict: Dict;
  shared: boolean;
  style: React.CSSProperties;
}) {
  const nums = cardNumbers(group, segment.cardIds);
  return (
    <div
      style={style}
      title={segment.activity}
      className={`relative m-[3px] flex flex-col overflow-hidden rounded-[5px] px-3 py-2 ${blockStyle[segment.mode]} ${
        segment.mode === "independent" ? "pl-4" : ""
      }`}
    >
      {segment.mode === "independent" && <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-hatch" />}
      <p className={`flex items-baseline justify-between gap-2 text-[0.68rem] font-semibold tracking-[0.06em] uppercase ${labelStyle[segment.mode]}`}>
        <span>{shared ? `${dict.common.allGroups} · ${dict.modes.joint}` : dict.modes[segment.mode]}</span>
        <span className="tabular font-medium tracking-normal normal-case">
          {t(dict.common.minuteRange, { a: segment.startMin, b: segment.endMin })}
        </span>
      </p>
      <p className="mt-1 line-clamp-3 text-[0.84rem] leading-snug">{segment.activity}</p>
      {nums.length > 0 && (
        <p className="mt-auto flex flex-wrap gap-1 pt-1.5">
          {nums.map((n) => (
            <span key={n} className="rounded-[3px] bg-card px-1.5 py-px text-[0.7rem] font-semibold text-ink shadow-[0_0_0_1px_var(--color-rule)]">
              {t(dict.common.card, { n })}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

const swatch: Record<SegmentMode, string> = {
  with_teacher: "bg-blue",
  independent: "bg-hatch",
  joint: "bg-ink",
};

function MobileTimeline({ plan, dict }: { plan: LessonPlan; dict: Dict }) {
  return (
    <ol className="space-y-0 md:hidden">
      {timeSlots(plan).map((slot) => (
        <li key={slot.startMin} className="grid grid-cols-[3.25rem_1fr] gap-3 border-t border-dashed border-rule py-4">
          <p className="tabular pt-0.5 text-[0.78rem] leading-tight text-ink-faint">
            {slot.startMin}–{slot.endMin}
            <br />
            <span className="text-[0.68rem]">{t(dict.common.minutes, { n: slot.endMin - slot.startMin })}</span>
          </p>
          <div className="space-y-3">
            {slot.allJoint ? (
              <Row mode="joint" title={`${dict.common.allGroups} · ${dict.modes.joint}`} text={slot.rows[0]?.segment?.activity} />
            ) : (
              slot.rows.map(({ group, segment }) =>
                segment ? (
                  <Row
                    key={group.id}
                    mode={segment.mode}
                    title={`${t(dict.common.grade, { n: group.grade })} · ${dict.modes[segment.mode]}`}
                    text={segment.activity}
                    cards={cardNumbers(group, segment.cardIds).map((n) => t(dict.common.card, { n }))}
                  />
                ) : null,
              )
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Row({ mode, title, text, cards = [] }: { mode: SegmentMode; title: string; text?: string; cards?: string[] }) {
  return (
    <div className="flex gap-3">
      <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-[3px] ${swatch[mode]}`} />
      <div className="min-w-0 text-[0.92rem] leading-snug">
        <p className="font-semibold text-ink">{title}</p>
        {text && <p className="mt-0.5 text-ink-soft">{text}</p>}
        {cards.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1">
            {cards.map((c) => (
              <span key={c} className="rounded-[3px] bg-card px-1.5 py-px text-[0.72rem] font-semibold text-ink shadow-[0_0_0_1px_var(--color-rule)]">
                {c}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
