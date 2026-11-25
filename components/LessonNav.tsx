"use client";

import { useEffect, useRef, useState } from "react";
import { getLessonToolsDict, type Locale } from "@/lib/i18n";
import { currentLessonSection } from "@/lib/lesson-navigation";

const ids = ["students", "timeline", "explain", "cards"] as const;
type SectionId = (typeof ids)[number];

/** Use the final sticky position even when a click starts at the page's very top. */
function navigationOffset(nav: HTMLElement | null) {
  if (!nav) return 140;
  return (
    (Number.parseFloat(getComputedStyle(nav).top) || 0) +
    nav.getBoundingClientRect().height +
    16
  );
}
export function LessonNav({ lang }: { lang: Locale }) {
  const d = getLessonToolsDict(lang);
  const nav = useRef<HTMLElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionId[]>([]);
  useEffect(() => {
    const root = nav.current?.closest("[data-lesson-view]");
    if (!root) return;
    let scheduled = 0;
    const update = () => {
      scheduled = 0;
      const visible = Array.from(
        root.querySelectorAll<HTMLElement>(ids.map((id) => `#${id}`).join(",")),
      ).filter((element) => element.getClientRects().length > 0);
      const order = visible.map((element) => element.id as SectionId);
      setSections((previous) =>
        previous.join() === order.join() ? previous : order,
      );
      setActive(
        currentLessonSection(
          visible.map((element) => ({
            id: element.id,
            top: element.getBoundingClientRect().top,
          })),
          navigationOffset(nav.current),
          window.innerHeight,
        ),
      );
    };
    const schedule = () => {
      if (!scheduled) scheduled = requestAnimationFrame(update);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(root, {
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
      ref={nav}
      aria-label={d.navigation}
      className="lesson-nav sticky top-16 z-20 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line bg-white px-4 py-2 lg:hidden print:hidden"
    >
      {sections.map((id) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(event) => {
            const target = nav.current
              ?.closest("[data-lesson-view]")
              ?.querySelector<HTMLElement>(`#${id}`);
            if (!target) return;
            event.preventDefault();
            target.setAttribute("tabindex", "-1");
            target.focus({ preventScroll: true });
            window.scrollTo({
              top:
                window.scrollY +
                target.getBoundingClientRect().top -
                navigationOffset(nav.current),
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
