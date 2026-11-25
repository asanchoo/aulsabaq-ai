import { z } from "zod";
const Name = z.string().regex(/^[a-z][a-z0-9_]{0,15}$/);
/** Values are sampled first, derived operands are constructed from them, then conditions checked. */
export const CardVariantSchema = z.object({
  prompt: z.string().min(1).max(1500),
  hint: z.string().min(1).max(600),
  ranges: z
    .array(
      z.object({ name: Name, min: z.number().int(), max: z.number().int() }),
    )
    .min(1)
    .max(8),
  derived: z
    .array(z.object({ name: Name, expression: z.string().min(1).max(120) }))
    .max(8),
  answerExpression: z.string().min(1).max(120),
  conditions: z.array(z.string().min(1).max(120)).max(12),
  original: z
    .array(z.object({ name: Name, value: z.number() }))
    .min(1)
    .max(16),
});
export type CardVariant = z.infer<typeof CardVariantSchema>;
