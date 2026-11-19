import type { StoredSession } from "./store";
import { readProgress, studentCards, type StudentCard } from "./student";
import { groupLanguage, type ExampleLevel, type Group } from "./schema";
import type { Visual } from "./visuals";
import { readTrainer, seededTask } from "./trainer";

/**
 * Памятка ученика: правило, схема и разобранные примеры из объяснения учителя. Ученик без учителя
 * должен видеть то, что учитель показывал на экране, а не только карточки. Ответов на карточки и на
 * «Попробуй сам» здесь нет: это образцы решения, их ответы ученик и так видел на слайдах.
 */
export type StudentGuide = {
  keyIdea: string;
  steps: string[];
  visual: Visual | null;
  examples: { level: ExampleLevel | null; problem: string; steps: string[]; answer: string; visual: Visual | null }[];
};

export function studentGuide(group: Group): StudentGuide {
  const e = group.explanation;
  return {
    keyIdea: e.keyIdea,
    steps: e.steps,
    visual: e.visuals[0] ?? null,
    examples: [e.example, ...e.examples].map((x) => ({ level: x.level, problem: x.problem, steps: x.steps, answer: x.answer, visual: x.visual })),
  };
}

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
  guide: StudentGuide;
  /** Запас: открывается, когда основные карточки решены. */
  extraCards: StudentCard[];
  /** Тренажёр без конца: текущее задание без ответа и счёт. null, если навыка для темы нет. */
  trainer: { solved: number; wrong: number; attempts: number; task: { index: number; prompt: string; inputHint: string; numeric: boolean; hint: string } } | null;
};

export function studentView(session: StoredSession, sessionId: string): StudentView | null {
  const group = session.plan.groups.find((g) => g.id === session.groupId);
  if (!group) return null;
  const progress = readProgress(session.progress);
  const trainerState = readTrainer(session.progress);
  const language = groupLanguage(session.plan, group);
  const task = group.trainer ? seededTask(group.trainer, sessionId, trainerState.index, language) : null;
  return {
    lessonId: session.lessonId,
    name: session.name,
    subject: session.plan.subject,
    language,
    grade: group.grade,
    topic: group.topic,
    cards: studentCards(group, progress),
    currentCard: session.currentCard,
    needsHelp: session.needsHelp,
    helpCard: session.helpCard,
    guide: studentGuide(group),
    extraCards: studentCards(group, progress, group.extraCards ?? []),
    trainer: task && {
      solved: trainerState.solved, wrong: trainerState.wrong, attempts: trainerState.attempts,
      task: { index: trainerState.index, prompt: task.prompt, inputHint: task.inputHint, numeric: task.numeric, hint: task.hint },
    },
  };
}
