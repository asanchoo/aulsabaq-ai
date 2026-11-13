import { cardNumbers, timeSlots } from "@/lib/lesson";
import type { Group, LessonPlan, Segment, SegmentMode } from "@/lib/schema";
import { t, type Dict } from "@/lib/i18n";
import { modeBlock, modeFill, modeLabel } from "./modes";

/**
 * Таймлайн урока.
 * Компьютер: колонки по классам, высота блока = длительность этапа (16px на минуту).
 * Телефон: список промежутков времени, «с 5 по 15 минуту: 2 класс с учителем, 4 класс сам».
 */

const MINUTE_PX = 16;

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
  const row = (minute: number) => minute + 2; // строка 1: заголовки классов

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
        gridTemplateColumns: `2.75rem repeat(${plan.groups.length}, minmax(0, 1fr))`,
        gridTemplateRows: `auto repeat(${plan.durationMin}, ${MINUTE_PX}px)`,
      }}
    >
      {plan.groups.map((g, i) => (
        <div key={g.id} className="px-1 pb-4" style={{ gridColumn: i + 2, gridRow: 1 }}>
          <p className="text-[1.05rem] font-semibold tracking-[-0.01em]">{t(dict.common.grade, { n: g.grade })}</p>
          <p className="mt-0.5 line-clamp-2 text-[0.85rem] leading-snug text-muted">{g.topic}</p>
        </div>
      ))}

      {bounds.map((b) => (
        <div key={`line-${b}`} className="border-t border-line" style={{ gridColumn: "1 / -1", gridRow: row(b) }} />
      ))}
      {bounds.map((b) => (
        <span
          key={`label-${b}`}
          className="tabular -mt-2 font-mono text-[0.72rem] leading-none text-faint"
          style={{
            gridColumn: 1,
            gridRow: b === plan.durationMin ? row(b) - 1 : row(b),
            alignSelf: b === plan.durationMin ? "end" : "start",
            marginBottom: b === plan.durationMin ? "-0.35rem" : undefined,
          }}
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
                style={{ gridColumn: shared ? "2 / -1" : i + 2, gridRow: `${row(s.startMin)} / ${row(s.endMin)}` }}
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
    <div style={style} title={segment.activity} className={`m-[3px] flex flex-col overflow-hidden rounded-lg px-3 py-2 ${modeBlock[segment.mode]}`}>
      <p className={`flex items-baseline justify-between gap-2 text-[0.72rem] font-semibold ${modeLabel[segment.mode]}`}>
        <span>{shared ? `${dict.common.allGroups} · ${dict.modes.joint}` : dict.modes[segment.mode]}</span>
        <span className="tabular font-mono font-medium">{t(dict.common.minuteRange, { a: segment.startMin, b: segment.endMin })}</span>
      </p>
      <p className="mt-1 line-clamp-3 text-[0.86rem] leading-snug">{segment.activity}</p>
      {nums.length > 0 && (
        <p className="mt-auto flex flex-wrap gap-1 pt-1.5">
          {nums.map((n) => (
            <span key={n} className="rounded-md bg-white/80 px-1.5 py-px text-[0.72rem] font-semibold text-ink">
              {t(dict.common.card, { n })}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function MobileTimeline({ plan, dict }: { plan: LessonPlan; dict: Dict }) {
  return (
    <ol className="md:hidden">
      {timeSlots(plan).map((slot) => (
        <li key={slot.startMin} className="grid grid-cols-[3.25rem_1fr] gap-3 border-t border-line py-4 first:border-t-0 first:pt-0">
          <p className="tabular pt-0.5 font-mono text-[0.78rem] leading-tight text-faint">
            {slot.startMin}–{slot.endMin}
            <br />
            <span className="text-[0.68rem]">{t(dict.common.minutes, { n: slot.endMin - slot.startMin })}</span>
          </p>
          <div className="grid gap-3">
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
      <span className={`mt-1 size-3.5 shrink-0 rounded-[4px] ${modeFill[mode]}`} />
      <div className="min-w-0 text-[0.94rem] leading-snug">
        <p className="font-semibold">{title}</p>
        {text && <p className="mt-0.5 text-muted">{text}</p>}
        {cards.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1">
            {cards.map((c) => (
              <span key={c} className="rounded-md bg-mint-soft px-1.5 py-px text-[0.74rem] font-semibold">
                {c}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
