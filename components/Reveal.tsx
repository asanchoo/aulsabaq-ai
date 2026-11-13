"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useInView, useIsClient } from "./motion";

/**
 * Проявляет блок один раз, когда до него доскроллили.
 * До гидратации data-shown не стоит, поэтому без JS блок просто виден.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  style,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = useIsClient();
  const shown = useInView(ref, { once: true, threshold: 0.15 });
  return (
    <div
      ref={ref}
      data-shown={mounted ? String(shown) : undefined}
      style={{ ...style, transitionDelay: `${delay}ms` }}
      className={`reveal ${className}`}
    >
      {children}
    </div>
  );
}
