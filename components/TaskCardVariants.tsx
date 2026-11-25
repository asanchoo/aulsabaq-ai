"use client";
import { useState } from "react";
import { personalPlan } from "@/lib/card-variants";
import { getVariantsDict, type Dict, type Locale } from "@/lib/i18n";
import type { LessonPlan } from "@/lib/schema";
import { TaskCards } from "./TaskCards";

/** The selected print seed changes both tasks and self-check answers, while the original stays the default. */
export function TaskCardVariants({
  plan,
  dict,
  lang,
}: {
  plan: LessonPlan;
  dict: Dict;
  lang: Locale;
}) {
  const [variant, setVariant] = useState(0);
  const d = getVariantsDict(lang);
  const printed = variant
    ? personalPlan({ ...plan, numberVariants: true }, `print-${variant}`)
    : plan;
  return (
    <>
      {plan.groups.some((g) => g.cards.some((c) => c.variant)) && (
        <div className="mb-5 flex flex-wrap gap-2 print:hidden">
          {[d.original, d.first, d.second].map((label, n) => (
            <button
              key={n}
              type="button"
              className="btn-secondary min-h-11"
              aria-pressed={variant === n}
              onClick={() => setVariant(n)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <TaskCards groups={printed.groups} dict={dict} />
    </>
  );
}
