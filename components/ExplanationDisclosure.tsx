"use client";
import { useSyncExternalStore, type ReactNode } from "react";

const query = "(min-width: 1024px)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const desktop = () => window.matchMedia(query).matches;
const server = () => false;

/** Native disclosure on phones; always expanded on desktop without hiding focused children. */
export function ExplanationDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const wide = useSyncExternalStore(subscribe, desktop, server);
  return (
    <details className="lesson-explanation" open={wide || undefined}>
      <summary className="mt-4 min-h-11 cursor-pointer py-3 text-sm font-semibold lg:hidden">
        {label}
      </summary>
      {children}
    </details>
  );
}
