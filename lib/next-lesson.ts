import type { LessonPlan } from "./schema";
import { groupLanguage } from "./schema";
import { LessonRequestSchema, type LessonRequest } from "./generation-schema";
import { getReportDict, t } from "./i18n";
import { lessonReport, type HelpRecord } from "./lesson-report";
import type { StudentRow } from "./help-queue";

export const NEXT_LESSON_KEY = "aulsabaq-next-lesson";

/** Keep a normal validated request, never pupil names or teacher credentials, in the next-lesson draft. */
export function nextLessonDraft(
  plan: LessonPlan,
  students: StudentRow[],
  history: HelpRecord[] = [],
): LessonRequest {
  const report = lessonReport(plan, students, history);
  return LessonRequestSchema.parse({
    subject: plan.subject,
    language: plan.language,
    durationMin: plan.durationMin,
    groups: plan.groups.map((group, i) => {
      const labels = getReportDict(groupLanguage(plan, group));
      const result = report[i];
      const notes = [
        result.advice
          ? t(labels.nextAdvice, { task: result.advice.prompt })
          : "",
        result.hard.length
          ? t(labels.nextHard, {
              tasks: result.hard.map((c) => c.prompt).join("; "),
            })
          : "",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 300);
      return {
        grade: group.grade,
        ...(group.quarter ? { quarter: group.quarter } : {}),
        language: groupLanguage(plan, group),
        topic: group.topic,
        notes,
      };
    }),
  });
}
