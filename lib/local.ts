"use client";

import { useSyncExternalStore } from "react";

/**
 * То, что помнит браузер учителя и ученика (localStorage), без регистрации:
 * - уроки учителя на этом устройстве и ключ учителя к каждому (с ним можно править урок и видеть учеников);
 * - последняя сессия ученика, чтобы после перезагрузки вернуться к своим карточкам.
 * Браузер может запретить хранение (приватный режим): тогда всё работает, но без памяти.
 */

export type SavedLessonRef = {
  id: string;
  token: string;
  subject: string;
  grades: number[];
  language: "kk" | "ru";
  createdAt: number;
  demo?: boolean;
};

const LESSONS_KEY = "aulsabaq-lessons";
const STUDENT_KEY = "aulsabaq-student";
const CHANGE = "aulsabaq-local-change";

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event(CHANGE));
  } catch {
    // хранение запрещено: работаем без памяти
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE, callback);
  };
}

/** Сырая строка из localStorage, обновляется при изменениях (и из другой вкладки). На сервере пусто. */
export function useLocal(key: string): string {
  return useSyncExternalStore(subscribe, () => read(key), () => "");
}

export function parseLessons(raw: string): SavedLessonRef[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v) => v && typeof v.id === "string" && typeof v.token === "string") : [];
  } catch {
    return [];
  }
}

export const useSavedLessons = () => parseLessons(useLocal(LESSONS_KEY));

/** Запомнить урок на этом устройстве; дату ставим здесь, а не в компоненте. */
export function rememberLesson(ref: Omit<SavedLessonRef, "createdAt">) {
  const all = parseLessons(read(LESSONS_KEY));
  const createdAt = all.find((l) => l.id === ref.id)?.createdAt ?? Date.now();
  write(LESSONS_KEY, JSON.stringify([{ ...ref, createdAt }, ...all.filter((l) => l.id !== ref.id)].slice(0, 30)));
}

export function forgetLesson(id: string) {
  write(LESSONS_KEY, JSON.stringify(parseLessons(read(LESSONS_KEY)).filter((l) => l.id !== id)));
}

export type StudentRef = { sessionId: string; name: string; subject: string; grade: number; language: "kk" | "ru" };

export function parseStudent(raw: string): StudentRef | null {
  try {
    const value = JSON.parse(raw);
    return value && typeof value.sessionId === "string" ? value : null;
  } catch {
    return null;
  }
}

export const useLastStudent = () => parseStudent(useLocal(STUDENT_KEY));
export const rememberStudent = (ref: StudentRef) => write(STUDENT_KEY, JSON.stringify(ref));
export const forgetStudent = () => write(STUDENT_KEY, "");

// ---------------------------------------------------------------------------
// Урок, который ещё собирается: номер сборки и ключ учителя. Если учитель закрыл вкладку или пропала сеть,
// форма найдёт сборку здесь и дождётся того же урока (он уже собирается и оплачен).

const PENDING_KEY = "aulsabaq-pending";
/** Дольше сборка не живёт (лимит сервера 300 с) — старую запись не возобновляем. */
const PENDING_MAX_MS = 10 * 60_000;

export type PendingLesson = {
  job: string;
  token: string;
  subject: string;
  grades: number[];
  language: "kk" | "ru";
  durationMin: number;
  /** Где сидят классы; нет поля — один кабинет. */
  rooms?: "one" | "separate";
  startedAt: number;
  /** Что учитель ввёл в форму (без фото): после перезагрузки форма снова заполнена, и при ошибке не надо вводить всё заново. */
  draft?: { quarter?: number; grade: number; language: "kk" | "ru"; topic: string; count: string; notes: string; pages: string }[];
};

export function readPending(): PendingLesson | null {
  try {
    const value = JSON.parse(read(PENDING_KEY) || "null");
    if (!value || typeof value.job !== "string" || typeof value.token !== "string") return null;
    return Date.now() - value.startedAt < PENDING_MAX_MS ? value : null;
  } catch {
    return null;
  }
}

export const rememberPending = (ref: PendingLesson) => write(PENDING_KEY, JSON.stringify(ref));
export const forgetPending = () => write(PENDING_KEY, "");
