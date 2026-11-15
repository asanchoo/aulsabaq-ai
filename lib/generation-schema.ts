import { z } from "zod";
import { GroupCoreSchema, LangSchema, TaskCardSchema, type LessonCore } from "./schema";
import { buildTimeline, type Schedule, type StageKind } from "./schedule";

export const LessonRequestSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  language: LangSchema,
  durationMin: z.number().int().min(30).max(90),
  groups: z.array(z.object({
    grade: z.number().int().min(1).max(11),
    topic: z.string().trim().min(1).max(300),
    studentCount: z.number().int().min(1).max(100).optional(),
  })).min(2).max(3),
}).refine((r) => new Set(r.groups.map((g) => g.grade)).size === r.groups.length);

export type LessonRequest = z.infer<typeof LessonRequestSchema>;

// Strict Structured Outputs: every field is required; optional values are null.
// Модель пишет только содержание урока: цели, карточки, тексты этапов, домашнее задание.
// Расписание по минутам считает lib/schedule.ts, объяснение темы — отдельный запрос (lib/ai.ts).

/** Что происходит на каждом этапе класса; код подставит эти тексты в отрезки таймлайна. */
export const StagesSchema = z.object({
  review: z.string().min(1),
  explain: z.string().min(1),
  practice: z.string().min(1),
  check: z.string().min(1),
});

export const GeneratedContentSchema = z.object({
  subject: z.string().min(1),
  language: LangSchema,
  durationMin: z.number().int(),
  opening: z.string().min(1),
  closing: z.string().min(1),
  groups: z.array(GroupCoreSchema.omit({ id: true }).extend({
    /**
     * Какую прошлую тему класс повторяет до объяснения. Модель пишет её до карточек: назвав тему явно,
     * она реже даёт «повторение» по новой теме. В урок поле не попадает.
     */
    reviewTopic: z.string().min(1),
    cards: z.array(TaskCardSchema.omit({ id: true }).extend({ answer: z.string().nullable() })),
    stages: StagesSchema,
  })),
  teacherNotes: z.string(),
});

export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;

/**
 * Содержание от модели + расписание от кода = урок.
 * Сначала сверяем количество карточек с тем, что просило расписание (CARDS), потом собираем таймлайн.
 * ID групп и карточек ставит код (g1, g1-c1…): модели незачем их придумывать.
 */
export function contentToLesson(content: GeneratedContent, schedule: Schedule): { ok: true; plan: LessonCore } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (content.groups.length !== schedule.cards.length) {
    return { ok: false, errors: [`REQUEST: нужно ${schedule.cards.length} групп, как в запросе`] };
  }
  content.groups.forEach((g, i) => {
    const want = schedule.cards[i];
    const review = g.cards.filter((c) => c.purpose === "review").length;
    const practice = g.cards.length - review;
    if (review !== want.review || practice !== want.practice) {
      errors.push(`CARDS: у группы ${i + 1} нужно карточек review ${want.review} и practice ${want.practice}, а сейчас ${review} и ${practice}`);
    }
  });
  if (errors.length) return { ok: false, errors };

  const groups = content.groups.map((g, i) => ({
    id: `g${i + 1}`,
    grade: g.grade,
    topic: g.topic,
    learningGoal: g.learningGoal,
    // Повторение первым: так карточки идут в том же порядке, в каком класс их решает.
    cards: [...g.cards.filter((c) => c.purpose === "review"), ...g.cards.filter((c) => c.purpose === "practice")]
      .map((c, k) => ({ ...c, id: `g${i + 1}-c${k + 1}`, answer: c.answer ?? undefined })),
    homework: g.homework,
  }));
  const timeline = buildTimeline(schedule, groups.map((g, i) => ({
    ...g,
    stageText: (stage: StageKind) => stage === "opening" ? content.opening : stage === "closing" ? content.closing : content.groups[i].stages[stage],
  })));
  return {
    ok: true,
    plan: { subject: content.subject, language: content.language, durationMin: content.durationMin, groups, timeline, teacherNotes: content.teacherNotes },
  };
}
