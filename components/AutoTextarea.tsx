"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type ChangeEvent, type KeyboardEvent, type TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  /**
   * Поле на одну мысль (тема, ответ): Enter отправляет форму, как у обычного input, а перенос строки
   * из вставленного текста заменяется пробелом. Длинный текст всё равно переносится и виден целиком.
   */
  singleLine?: boolean;
  /** Сколько строк видно, пока текста мало. */
  minRows?: number;
};

/**
 * Поле, которое растёт вниз вместе с текстом, а не прячет его за правым краем.
 * Высоту считает код по scrollHeight: CSS field-sizing пока есть не во всех браузерах учителей.
 */
export function AutoTextarea({ singleLine = false, minRows = 1, className = "", onChange, onKeyDown, value, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + borders}px`;
  }, []);

  useLayoutEffect(fit, [fit, value]);
  // Узкий экран или поворот телефона: строки переносятся иначе, высота должна пересчитаться.
  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  function change(event: ChangeEvent<HTMLTextAreaElement>) {
    if (singleLine && /[\r\n]/.test(event.target.value)) event.target.value = event.target.value.replace(/\s*[\r\n]+\s*/g, " ");
    onChange?.(event);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (singleLine && event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      onChange={change}
      onKeyDown={keyDown}
      aria-multiline={singleLine ? false : undefined}
      className={`resize-none overflow-hidden ${className}`}
      {...rest}
    />
  );
}
