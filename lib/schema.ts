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
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
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

export const GroupSchema = z.object({
  id: z.string().min(1),
  grade: z.number().int().min(1).max(11),
  topic: z.string().min(1),
  learningGoal: z.string().min(1),
  cards: z.array(TaskCardSchema),
});

export const LessonPlanSchema = z.object({
  subject: z.string().min(1),
  language: LangSchema,
  durationMin: z.number().int(),
  groups: z.array(GroupSchema),
  timeline: z.array(SegmentSchema),
  teacherNotes: z.string(),
});

export type Lang = z.infer<typeof LangSchema>;
export type TaskCard = z.infer<typeof TaskCardSchema>;
export type SegmentMode = z.infer<typeof SegmentModeSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Group = z.infer<typeof GroupSchema>;
export type LessonPlan = z.infer<typeof LessonPlanSchema>;
