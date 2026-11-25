import { fail, storageFailure, teacherToken } from "@/lib/api";
import { getLesson, isTeacher } from "@/lib/store";

/** Authorize before loading any teacher state; a public lesson URL is not a teacher credential. */
export async function GET(
  request: Request,
  context: RouteContext<"/api/lessons/[id]/teacher">,
) {
  const { id } = await context.params;
  try {
    if (!(await isTeacher(id, teacherToken(request))))
      return fail("forbidden", 403);
    const lesson = await getLesson(id);
    return lesson
      ? Response.json({ plan: lesson.plan, isDemo: lesson.isDemo })
      : fail("not_found", 404);
  } catch (error) {
    return storageFailure(error);
  }
}
