"use client";

import { useEffect, useState } from "react";
import { getLessonToolsDict, type Locale } from "@/lib/i18n";

const ids = ["timeline", "explain", "cards", "students"] as const;
export function LessonNav({ lang }: { lang: Locale }) {
  const d = getLessonToolsDict(lang);
  const [active, setActive] = useState<string>("timeline");
  const [students, setStudents] = useState(false);
  useEffect(() => {
    let scheduled = 0;
    const update = () => {
      scheduled = 0;
      setStudents(!!document.getElementById("students"));
      const sections = ids
        .map((id) => ({
          id,
          top: document.getElementById(id)?.getBoundingClientRect().top,
        }))
        .filter((s) => s.top !== undefined);
      const above = sections
        .filter((s) => s.top! <= 145)
        .sort((a, b) => b.top! - a.top!);
      setActive(above[0]?.id ?? sections[0]?.id ?? "timeline");
    };
    const schedule = () => {
      if (!scheduled) scheduled = requestAnimationFrame(update);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.getElementById("main") ?? document.body, {
      childList: true,
      subtree: true,
    });
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(scheduled);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return (
    <nav
      aria-label={d.navigation}
      className="lesson-nav sticky top-16 z-20 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line bg-white px-4 py-2 lg:hidden print:hidden"
    >
      {ids
        .filter((id) => id !== "students" || students)
        .map((id) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(event) => {
              const target = document.getElementById(id);
              if (!target) return;
              event.preventDefault();
              target.setAttribute("tabindex", "-1");
              target.focus({ preventScroll: true });
              window.scrollTo({
                top: window.scrollY + target.getBoundingClientRect().top - 140,
                behavior: "instant",
              });
              window.history.replaceState(null, "", `#${id}`);
              setActive(id);
            }}
            aria-current={active === id ? "location" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-btn px-2 text-[0.8rem] font-semibold ${active === id ? "bg-mint text-ink" : "text-muted"}`}
          >
            {d[id]}
          </a>
        ))}
    </nav>
  );
}
