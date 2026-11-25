import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { LessonCoreSchema } from "@/lib/schema";
import { validateLessonPlan } from "@/lib/validate";
import { requestMismatch } from "@/lib/ai";

const directory = new URL("./results/2026-11-24/", import.meta.url);
const read = async (name: string) =>
  JSON.parse(await readFile(new URL(name, directory), "utf8"));

for (let id = 1; id <= 10; id++) {
  it(`replays saved pair ${id} without model calls`, async () => {
    const row = await read(`${id}-result.json`);
    for (const arm of ["baseline", "product"] as const) {
      const recorded = row[arm];
      // A rejected generation has no final artifact to re-score.
      if (recorded.error) {
        expect(recorded.valid).toBe(false);
        continue;
      }
      const parsed = LessonCoreSchema.safeParse(
        await read(`${id}-${arm}.json`),
      );
      expect(parsed.success).toBe(recorded.schema);
      if (!parsed.success) {
        expect(recorded.codes).toEqual(["SCHEMA"]);
        console.info(
          `Pair ${id}, ${arm}:`,
          parsed.error.issues.map(({ path, message }) => ({ path, message })),
        );
        continue;
      }
      const checked = validateLessonPlan(parsed.data);
      const errors = [
        ...(checked.ok ? [] : checked.errors),
        ...requestMismatch(parsed.data, row.input),
      ];
      expect(errors).toEqual(recorded.errors);
      expect(errors.length === 0).toBe(recorded.valid);
    }
  });
}
