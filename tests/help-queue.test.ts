import { expect, it } from "vitest";
import { buildHelpQueue, availableIn, type StudentRow } from "@/lib/help-queue";
import { demoFor } from "@/lib/demo";
const plan = demoFor("ru");
const now = Date.parse("2026-11-24T12:00:00Z");
const group = plan.groups[1]; const card = group.cards[0].id;
const pupil = (id: string, patch: Partial<StudentRow> = {}): StudentRow => ({ id, name: id, groupId: group.id, currentCard: card, needsHelp: false, helpCard: null, hintsUsed: 0, updatedAt: new Date(now - 300_000).toISOString(), cards: {}, ...patch });
it("prioritizes explicit requests and longest wait", () => {
  const list = buildHelpQueue([pupil("new", { needsHelp: true, helpCard: card, updatedAt: new Date(now-60000).toISOString() }), pupil("old", { needsHelp: true, helpCard: card })], plan, now, 10);
  expect(list[0].studentId).toBe("old"); expect(list[1].studentId).toBe("new");
});
it("flags three failed attempts but not solved cards", () => {
  const cards = { [card]: { status: "todo" as const, attempts: 3, hints: 0, lastAnswer: "0" } };
  expect(buildHelpQueue([pupil("a", { cards })],plan,now)[0].reason).toBe("attempts");
  expect(buildHelpQueue([pupil("a", {cards:{[card]:{...cards[card],status:"correct"}}})],plan,now)).toEqual([]);
});
it("flags idle pupils only during independent work with a running clock", () => {
  expect(buildHelpQueue([pupil("a")],plan,now,10)[0].reason).toBe("idle");
  expect(buildHelpQueue([pupil("a")],plan,now,20)).toEqual([]);
  expect(buildHelpQueue([pupil("a")],plan,now)).toEqual([]);
});
it("suggests class help when at least half of two or more pupils struggle", () => {
  const cards = { [card]: { status: "todo" as const, attempts: 3, hints: 0, lastAnswer: "0" } };
  const list = buildHelpQueue([pupil("a",{cards}),pupil("b",{cards}),pupil("c"),pupil("d")],plan,now);
  expect(list.find((x)=>x.reason==="class_stuck")).toMatchObject({count:2,total:4});
  expect(buildHelpQueue([pupil("a",{cards})],plan,now).some((x)=>x.reason==="class_stuck")).toBe(false);
});
it("respects teacher's scheduled group", () => {
  expect(availableIn(plan,group.id,10)).toBe(5);
  expect(availableIn(plan,group.id,20)).toBe(0);
  expect(availableIn(plan,group.id,plan.durationMin)).toBeNull();
});
it("ignores stale or foreign card ids and malformed times", () => {
  expect(buildHelpQueue([pupil("a",{currentCard:"missing",needsHelp:true})],plan,now,10)).toEqual([]);
  expect(buildHelpQueue([pupil("a",{updatedAt:"bad"})],plan,now,10)).toEqual([]);
});
