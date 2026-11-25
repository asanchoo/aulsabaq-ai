import { z } from "zod";
import { fail, readJson, storageFailure, teacherToken } from "@/lib/api";
import { applyEdit, LessonEditSchema } from "@/lib/edit";
import { checkLimit, clientIp, limited } from "@/lib/rate-limit";
import { getLesson, isTeacher, updateLesson } from "@/lib/store";

/** PATCH: учитель сохраняет правки текстов урока. Нужен ключ учителя в заголовке x-teacher-token. */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/lessons/[id]">,
) {
  const retryAfter = await checkLimit("teacher", clientIp(request));
  if (retryAfter) return limited(retryAfter);
  const { id } = await ctx.params;
  const token = teacherToken(request);
  const body = await readJson(request, 64_000);
  if (body instanceof Response) return body;
  const setting = z
    .object({ numberVariants: z.boolean() })
    .strict()
    .safeParse(body);
  const edit = LessonEditSchema.safeParse(body);
  if (!edit.success && !setting.success) return fail("bad_request", 400);
  try {
    if (!(await isTeacher(id, token))) return fail("forbidden", 403);
    const lesson = await getLesson(id);
    if (!lesson) return fail("not_found", 404);
    if (setting.success) {
      if (
        !(await updateLesson(id, token, {
          ...lesson.plan,
          numberVariants: setting.data.numberVariants,
        }))
      )
        return fail("forbidden", 403);
      return Response.json({ ok: true });
    }
    if (!edit.success) return fail("bad_request", 400);
    const result = applyEdit(lesson.plan, edit.data);
    if (!result.ok)
      return Response.json(
        { error: "invalid_edit", issues: result.issues },
        { status: 422 },
      );
    if (!(await updateLesson(id, token, result.plan)))
      return fail("forbidden", 403);
    return Response.json({ ok: true, warnings: result.warnings });
  } catch (error) {
    return storageFailure(error);
  }
}
