import { z } from "zod";

/**
 * Zod-схемы урока (SPEC §5).
 *
 * Разделение ответственности:
 * - здесь проверяется ФОРМА данных: какие поля есть и какого они типа;
 * - lib/validate.ts проверяет СМЫСЛ: таймлайн без дыр, учитель не с двумя группами сразу и т.д.
 */

export const LangSchema = z.enum(["kk", "ru"]);

export const TaskCardSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["closed", "open"]),
  prompt: z.string().min(1),
  /** Для closed — эталон для самопроверки. Наличие проверяет validateLessonPlan (инвариант 5). */
  answer: z.string().optional(),
  successCriteria: z.string().min(1),
  /** Наводящая подсказка без готового ответа: что вспомнить или с чего начать. Инвариант 8 проверяет, что ответа в ней нет. */
  hint: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /**
   * review: повторение того, что класс уже знает (можно делать до объяснения учителя);
   * practice: задание по новой теме (только после объяснения). Порядок проверяет инвариант 7.
   */
  purpose: z.enum(["review", "practice"]),
});

export const SegmentModeSchema = z.enum(["with_teacher", "independent", "joint"]);

export const SegmentSchema = z.object({
  groupId: z.string().min(1),
  /** Минута начала, включительно. */
  startMin: z.number().int().min(0),
  /** Минута конца, не включительно. */
  endMin: z.number().int().min(1),
  mode: SegmentModeSchema,
  activity: z.string().min(1),
  /** Для independent — какие карточки делает группа. */
  cardIds: z.array(z.string()).optional(),
});

/** Разобранный пример: условие, шаги решения и ответ. */
export const WorkedExampleSchema = z.object({
  problem: z.string().min(1),
  steps: z.array(z.string().min(1)).min(2).max(6),
  answer: z.string().min(1),
});

/**
 * Материал учителя для объяснения новой темы на этапе «с учителем».
 * Из этих полей страница урока собирает и текст для учителя, и слайды для показа классу,
 * поэтому структура фиксированная: модель не придумывает вёрстку, только содержание.
 */
export const ExplanationSchema = z.object({
  /** С чего начать: жизненная ситуация, вопрос или откуда взялась тема. 1–3 предложения. */
  hook: z.string().min(1),
  /** Главное правило или мысль темы, 1–2 предложения. */
  keyIdea: z.string().min(1),
  /** Как это работает: шаги правила или рассуждения. */
  steps: z.array(z.string().min(1)).min(2).max(6),
  example: WorkedExampleSchema,
  /** Типичные ошибки учеников и как их заметить. */
  mistakes: z.array(z.string().min(1)).min(1).max(3),
  /** Вопросы классу, чтобы проверить понимание перед самостоятельной работой. */
  checkQuestions: z.array(z.string().min(1)).min(2).max(4),
});

export const GroupSchema = z.object({
  id: z.string().min(1),
  grade: z.number().int().min(1).max(11),
  topic: z.string().min(1),
  learningGoal: z.string().min(1),
  explanation: ExplanationSchema,
  cards: z.array(TaskCardSchema),
  /** Короткое домашнее задание по новой теме. */
  homework: z.string().min(1),
});

export const LessonPlanSchema = z.object({
  subject: z.string().min(1),
  language: LangSchema,
  durationMin: z.number().int(),
  groups: z.array(GroupSchema),
  timeline: z.array(SegmentSchema),
  teacherNotes: z.string(),
});

/**
 * Урок без объяснений темы: расписание, карточки, домашнее задание.
 * Объяснение каждого класса модель пишет отдельным запросом (см. lib/ai.ts),
 * поэтому правила таймлайна и карточек проверяются на уроке без него.
 */
export const GroupCoreSchema = GroupSchema.omit({ explanation: true });
export const LessonCoreSchema = LessonPlanSchema.extend({ groups: z.array(GroupCoreSchema) });

export type Lang = z.infer<typeof LangSchema>;
export type TaskCard = z.infer<typeof TaskCardSchema>;
export type CardPurpose = TaskCard["purpose"];
export type SegmentMode = z.infer<typeof SegmentModeSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type Explanation = z.infer<typeof ExplanationSchema>;
export type LessonPlan = z.infer<typeof LessonPlanSchema>;
export type LessonCore = z.infer<typeof LessonCoreSchema>;
