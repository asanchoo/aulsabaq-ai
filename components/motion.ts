"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/**
 * Общие хуки для анимаций.
 * useInView: виден ли блок на экране (анимация не крутится, пока её никто не видит).
 * useReducedMotion: пользователь попросил систему убрать движение, тогда показываем статичную картинку.
 */
export function useInView(ref: RefObject<Element | null>, { once = false, threshold = 0.25 } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) io.disconnect();
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, threshold]);
  return inView;
}

// Системная настройка «уменьшить движение»: подписка на matchMedia без setState в эффекте.
const reducedQuery = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(reducedQuery);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(reducedQuery).matches, () => false);
}

// true в браузере после гидратации, false при серверной отрисовке
const noop = () => () => {};
export function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false);
}
