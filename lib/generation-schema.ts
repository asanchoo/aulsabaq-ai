import { z } from "zod";
import { EXAMPLE_LEVELS, GroupCoreSchema, LangSchema, QuickTaskSchema, TaskCardSchema, TermSchema, type LessonCore } from "./schema";
import { VisualDraftSchema } from "./visuals";
import { buildTimeline, MAX_CARDS, MIN_PRACTICE_CARDS, type Schedule, type StageKind } from "./schedule";

/** Фото страницы учебника: сжатый в браузере JPEG/PNG/WebP в base64 (до ~700 КБ). В базе не хранится. */
export const PhotoSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(100).max(900_000).regex(/^[A-Za-z0-9+/=]+$/),
});
export const MAX_PHOTOS_PER_GROUP = 2;

export const LessonRequestSchema = z.object({
  subject: z.string().trim().min(1).max(100),
  language: LangSchema,
  durationMin: z.number().int().min(30).max(90),
  groups: z.array(z.object({
    grade: z.number().int().min(1).max(11),
    topic: z.string().trim().min(1).max(300),
    studentCount: z.number().int().min(1).max(100).optional(),
    /** Что учитель хочет сказать о классе: что уже прошли, уровень, на что обратить внимание. Необязательно. */
    notes: z.string().trim().max(300).optional(),
    /** Страницы учебника, где сейчас класс («34–35»). Необязательно. */
    pages: z.string().trim().max(40).optional(),
    /** Фото этих страниц: модель строит объяснение, примеры и домашнее задание по ним. Необязательно. */
    photos: z.array(PhotoSchema).max(MAX_PHOTOS_PER_GROUP).optional(),
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
  groups: z.array(GroupCoreSchema.omit({ id: true, source: true }).extend({
    /**
     * Какую прошлую тему класс повторяет до объяснения. Модель пишет её до карточек: назвав тему явно,
     * она реже даёт «повторение» по новой теме. В урок поле не попадает.
     */
    reviewTopic: z.string().min(1),
    cards: z.array(TaskCardSchema.omit({ id: true }).extend({ answer: z.string().nullable(), minutes: z.number().int().min(1).max(20) })),
    stages: StagesSchema,
  })),
  teacherNotes: z.string(),
});

export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;

/**
 * Содержание от модели + расписание от кода = урок.
 * Карточек не фиксированное число: модель пишет их, пока по её оценке минут хватает на всё время
 * самостоятельной работы. Здесь проверяем только границы (CARDS), а хватает ли минут, проверяет
 * validateLessonPlan (инвариант 10) уже на собранном уроке. ID групп и карточек ставит код (g1, g1-c1…).
 */
export function contentToLesson(content: GeneratedContent, schedule: Schedule): { ok: true; plan: LessonCore; warnings: string[] } | { ok: false; errors: string[] } {
  const warnings: string[] = [];
  if (content.groups.length !== schedule.cards.length) {
    return { ok: false, errors: [`REQUEST: нужно ${schedule.cards.length} групп, как в запросе`] };
  }
  content.groups.forEach((g, i) => {
    const want = schedule.cards[i];
    const review = g.cards.filter((c) => c.purpose === "review").length;
    const practice = g.cards.length - review;
    if (want.reviewMinutes > 0 && review === 0) warnings.push(`CARDS: у группы ${i + 1} есть ${want.reviewMinutes} мин повторения, нужны карточки review`);
    if (practice < MIN_PRACTICE_CARDS) warnings.push(`CARDS: у группы ${i + 1} нужно не меньше ${MIN_PRACTICE_CARDS} карточек practice`);
    if (g.cards.length > MAX_CARDS) warnings.push(`CARDS: у группы ${i + 1} больше ${MAX_CARDS} карточек; объедини короткие задания`);
  });

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
    warnings,
    plan: { subject: content.subject, language: content.language, durationMin: content.durationMin, groups, timeline, teacherNotes: content.teacherNotes },
  };
}

/** Запрос без фото: фото уходят модели картинками, а не текстом в JSON. */
export function requestForModel(input: LessonRequest) {
  return {
    ...input,
    groups: input.groups.map((g) => {
      const rest = { ...g };
      delete rest.photos;
      return { ...rest, textbookPhotos: g.photos?.length ?? 0 };
    }),
  };
}

// Объяснение темы от модели: наглядные блоки — плоские черновики (lib/visuals.ts), код проверяет и собирает их.
const GeneratedExampleSchema = z.object({
  level: z.enum(EXAMPLE_LEVELS),
  problem: z.string().min(1),
  steps: z.array(z.string().min(1)).min(2).max(8),
  answer: z.string().min(1),
  visual: VisualDraftSchema.nullable(),
});

// Порядок полей — порядок, в котором модель пишет: сначала зачем и простыми словами, потом правило, схемы, примеры.
export const GeneratedExplanationSchema = z.object({
  hook: z.string().min(1),
  intuition: z.string().min(1),
  terms: z.array(TermSchema).max(8),
  keyIdea: z.string().min(1),
  visuals: z.array(VisualDraftSchema).max(6),
  steps: z.array(z.string().min(1)).min(2).max(8),
  example: GeneratedExampleSchema,
  examples: z.array(GeneratedExampleSchema).min(3).max(6),
  practice: z.array(QuickTaskSchema).min(2).max(8),
  mistakes: z.array(z.string().min(1)).min(1).max(4),
  summary: z.array(z.string().min(1)).min(3).max(6),
  checkQuestions: z.array(z.string().min(1)).min(2).max(4),
});
export type GeneratedExplanation = z.infer<typeof GeneratedExplanationSchema>;
