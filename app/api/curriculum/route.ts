import { curriculumTopics } from "@/lib/curriculum";

/** Read-only suggestions disclose only public curriculum titles, never lesson/session data. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const grade = Number(q.get("grade"));
  const quarter = Number(q.get("quarter"));
  if (!Number.isInteger(grade) || grade < 1 || grade > 11 || ![1, 2, 3, 4].includes(quarter))
    return Response.json({ topics: [] });
  return Response.json({ topics: curriculumTopics({ subject: (q.get("subject") ?? "").slice(0, 100),
    grade, quarter, language: q.get("language") === "kk" ? "kk" : "ru" }) });
}
