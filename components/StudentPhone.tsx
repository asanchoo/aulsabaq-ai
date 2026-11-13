import type { Dict } from "@/lib/i18n";

/**
 * Экран ученика в телефоне: карточка, ввод ответа, подсказка-вопрос.
 * Это картинка продукта на главной (aria-hidden), поэтому описание для экранного
 * диктора стоит на обёртке через role="img".
 */
export function StudentPhone({ dict, className = "" }: { dict: Dict; className?: string }) {
  const p = dict.phone;
  return (
    <div
      aria-hidden
      className={`aspect-[300/610] rounded-[44px] bg-[#111] p-2.5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.45)] ${className}`}
    >
      <div className="flex h-full flex-col gap-2.5 overflow-hidden rounded-[35px] bg-white px-4 pt-9 pb-4 sm:gap-3 sm:px-5 sm:pt-11 sm:pb-5 text-[#16181a]">
        <div className="flex items-center justify-between text-[12.5px] text-muted">
          <span>{p.student}</span>
          <span className="flex gap-1">
            {[1, 2, 3, 4].map((n) => (
              <i key={n} className={`h-1 w-5 rounded-full ${n <= 2 ? "bg-ink" : "bg-line"}`} />
            ))}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-muted sm:mt-2">{p.card}</p>
        <p className="text-[21px] leading-[1.12] font-medium tracking-[-0.02em] sm:text-[26px]">{p.task}</p>
        <div className="flex h-13 items-center rounded-xl border-[1.5px] border-line-strong px-4 font-mono text-[22px] font-medium">
          {p.answer}
          <i className="ml-0.5 h-6 w-0.5 bg-ink" />
        </div>
        <div className="rounded-[14px] bg-mint px-3.5 py-3 text-[14px] leading-snug">
          <small className="mb-0.5 block text-[11.5px] text-[#3f5a4b]">{p.hintLabel}</small>
          {p.hint}
        </div>
        <div className="mt-auto grid gap-2">
          <span className="grid h-11.5 place-items-center rounded-xl bg-ink text-[14px] font-semibold text-white">{p.check}</span>
          <span className="grid h-11.5 place-items-center rounded-xl bg-surface text-[14px] font-semibold">{p.more}</span>
        </div>
        <span className="hidden text-center text-[12.5px] text-muted underline underline-offset-[3px] sm:block">{p.help}</span>
      </div>
    </div>
  );
}
