/** Positions must follow the rendered section order, excluding hidden page trees. */
export function currentLessonSection(
  sections: { id: string; top: number }[],
  topEdge: number,
  viewportHeight: number,
): string | null {
  return (
    [...sections].reverse().find((s) => s.top <= topEdge + 2)?.id ??
    sections.find((s) => s.top < viewportHeight)?.id ??
    null
  );
}
