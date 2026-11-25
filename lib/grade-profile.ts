/** Conservative defaults from mathematics programme №399, goals 1/2/3/4.1.1 and 2.1.2.4.
 * Quarter 1–2 in grade 1 stays within 10; later quarters may use 20.
 * The programme also includes hundreds in grade 2: the author's safety rule deliberately caps variants at 100. */
export function gradeProfile(grade: number, quarter?: number, topic = "") {
  const explicitNegative = /отрицатель|теріс|целые числа|бүтін сандар/iu.test(
    topic,
  );
  const explicitFraction = /дроб|десятич|бөлшек|ондық бөлшек/iu.test(topic);
  return {
    max:
      grade === 1
        ? quarter && quarter <= 2
          ? 10
          : 20
        : grade === 2
          ? 100
          : grade === 3
            ? 1000
            : 1_000_000,
    min: grade >= 5 && explicitNegative ? -1_000_000 : 0,
    fractions: grade >= 5 && explicitFraction,
    tableMax: grade <= 2 ? 5 : 9,
    multiplication: grade >= 2 && !(grade === 2 && quarter && quarter < 3),
    remainder: grade >= 3,
  };
}
export type GradeProfile = ReturnType<typeof gradeProfile>;
export const withinProfile = (value: number, profile: GradeProfile) =>
  Number.isFinite(value) &&
  value >= profile.min &&
  value <= profile.max &&
  (profile.fractions || Number.isInteger(value));
