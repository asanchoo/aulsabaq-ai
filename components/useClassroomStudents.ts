"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocal } from "@/lib/local";
import { demoClass } from "@/lib/demo-class";
import { lessonSignal } from "@/lib/lesson-signal";
import type { StudentRow } from "@/lib/help-queue";
import type { LessonPlan } from "@/lib/schema";

const demoKey = (id: string) => `aulsabaq-demo:${id}`;
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event("aulsabaq-local-change"));
  } catch {
    /* browser storage unavailable */
  }
}
/** The demo keeps its start time across workspace/live navigation, without creating database pupils. */
export function useDemoClass(lessonId: string) {
  const raw = useLocal(demoKey(lessonId));
  const start = Number(raw) || null;
  return {
    start,
    toggle: () =>
      write(demoKey(lessonId), start === null ? String(Date.now()) : ""),
  };
}

/** One polling and demo implementation serves the detailed panel and the compact phone controller. */
export function useClassroomStudents(
  lessonId: string,
  token: string,
  plan: LessonPlan,
  demoStart: number | null,
) {
  const [real, setReal] = useState<StudentRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [sampleTime, setSampleTime] = useState(() => Date.now());
  const [demoNow, setDemoNow] = useState(() => Date.now());
  const observed = useRef(new Map<string, string>());
  const helpedKey = `aulsabaq-demo-helped:${lessonId}:${demoStart}`;
  const helpedRaw = useLocal(helpedKey);
  const students = useMemo(() => {
    let cleared: string[] = [];
    try {
      const parsed: unknown = JSON.parse(helpedRaw || "[]");
      if (Array.isArray(parsed))
        cleared = parsed.filter((s): s is string => typeof s === "string");
    } catch {
      /* stale demo record */
    }
    const simulated =
      demoStart === null
        ? []
        : demoClass(plan, 42, demoStart, (demoNow - demoStart) / 1000).map(
            (s) => (cleared.includes(s.id) ? { ...s, needsHelp: false } : s),
          );
    return real === null && !simulated.length
      ? null
      : [...(real ?? []), ...simulated];
  }, [real, plan, demoStart, demoNow, helpedRaw]);
  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`/api/lessons/${lessonId}/students`, {
        headers: { "x-teacher-token": token },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("students");
      const data = (await response.json()) as { students: StudentRow[] };
      for (const id of observed.current.keys())
        if (!data.students.some((s) => s.id === id && s.needsHelp))
          observed.current.delete(id);
      setReal(
        data.students.map((s) => {
          if (!s.needsHelp) return s;
          if (!observed.current.has(s.id))
            observed.current.set(s.id, s.updatedAt);
          return { ...s, helpRequestedAt: observed.current.get(s.id) };
        }),
      );
      setSampleTime(Date.now());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [lessonId, token]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
      setDemoNow(Date.now());
    }, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);
  const previous = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!students) return;
    const help = new Set(students.filter((s) => s.needsHelp).map((s) => s.id));
    if (previous.current && [...help].some((id) => !previous.current!.has(id)))
      lessonSignal();
    previous.current = help;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = help.size ? `(${help.size}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [students]);
  async function helped(sessionId: string) {
    if (sessionId.startsWith("demo-student-")) {
      let cleared: string[] = [];
      try {
        cleared = JSON.parse(helpedRaw || "[]") as string[];
      } catch {
        /* no history */
      }
      write(helpedKey, JSON.stringify([...cleared, sessionId]));
      return;
    }
    try {
      const response = await fetch(`/api/lessons/${lessonId}/students`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-teacher-token": token,
        },
        body: JSON.stringify({ action: "clear_help", sessionId }),
      });
      if (!response.ok) throw new Error("help");
      await load();
    } catch {
      setOffline(true);
    }
  }
  return { students, offline, sampleTime, demoNow, helped };
}
