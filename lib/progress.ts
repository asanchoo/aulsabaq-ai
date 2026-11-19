/**
 * Что уже готово в сборке урока. Сервер пишет это в базу на каждом этапе (lib/ai.ts → app/api/lessons),
 * страница учителя показывает по нему настоящий ход сборки, а не шаги по таймеру.
 */
export type LessonStage = "explain" | "content" | "check" | "proof" | "save" | "done";

export type LessonProgress = {
  stage: LessonStage;
  /** Сколько классов в уроке и у скольких уже готово объяснение темы со слайдами. */
  classes: number;
  explained: number;
  /** Сколько раз проверка кода нашла ошибку (в счёте, в правиле, в ответе) и ИИ переписал ответ. */
  repairs: number;
  /** Карточек у всех классов вместе, после того как готово содержание. */
  cards?: number;
  /** Заданий в запасе у всех классов вместе. */
  extra?: number;
  /** Какая проверка идёт: правила языка или решение задач заново. */
  check?: "rules" | "verify";
};

export const initialProgress = (classes: number): LessonProgress => ({ stage: "explain", classes, explained: 0, repairs: 0 });

const STAGES: LessonStage[] = ["explain", "content", "check", "proof", "save", "done"];

/** Порядок этапа: чтобы показать, что пройдено, а что впереди. */
export const stageIndex = (stage: LessonStage) => STAGES.indexOf(stage);

/** Ответ сервера о сборке. stale: сервер давно не писал, значит, он остановился, урока не будет. */
export type JobView = {
  status: "running" | "ready" | "failed";
  progress: LessonProgress;
  lessonId: string | null;
  joinCode: string | null;
  error: string | null;
  stale: boolean;
  /** Сколько секунд идёт сборка: таймер на экране не обнуляется после обновления страницы. */
  elapsed: number;
};
