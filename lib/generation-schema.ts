import { z } from "zod";
import { GroupCoreSchema, LangSchema, LessonCoreSchema, SegmentSchema, TaskCardSchema } from "./schema";

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
// Расписание и карточки без объяснений: объяснение каждого класса модель пишет отдельным запросом.
export const GeneratedPlanSchema = LessonCoreSchema.extend({
  groups: z.array(GroupCoreSchema.extend({
    cards: z.array(TaskCardSchema.extend({ answer: z.string().nullable() })),
  })),
  timeline: z.array(SegmentSchema.extend({ cardIds: z.array(z.string()).nullable() })),
});

export function normalizeGeneratedPlan(value: unknown): unknown {
  const parsed = GeneratedPlanSchema.safeParse(value);
  if (!parsed.success) return value;
  return {
    ...parsed.data,
    groups: parsed.data.groups.map((g) => ({ ...g, cards: g.cards.map((c) => ({ ...c, answer: c.answer ?? undefined })) })),
    timeline: parsed.data.timeline.map((s) => ({ ...s, cardIds: s.cardIds ?? undefined })),
  };
}
