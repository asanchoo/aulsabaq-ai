import type { StoredSession } from "./store";
import { readProgress, studentCards, type StudentCard } from "./student";

/** Что видит ученик на телефоне. Эталонов ответов и подсказок карточек здесь нет. */
export type StudentView = {
  lessonId: string;
  name: string;
  subject: string;
  language: "kk" | "ru";
  grade: number;
  topic: string;
  cards: StudentCard[];
  currentCard: string | null;
  needsHelp: boolean;
  helpCard: string | null;
};

export function studentView(session: StoredSession): StudentView | null {
  const group = session.plan.groups.find((g) => g.id === session.groupId);
  if (!group) return null;
  return {
    lessonId: session.lessonId,
    name: session.name,
    subject: session.plan.subject,
    language: session.plan.language,
    grade: group.grade,
    topic: group.topic,
    cards: studentCards(group, readProgress(session.progress)),
    currentCard: session.currentCard,
    needsHelp: session.needsHelp,
    helpCard: session.helpCard,
  };
}
