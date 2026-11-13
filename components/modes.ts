import type { SegmentMode } from "@/lib/schema";

/**
 * Цвета режимов урока в одном месте: партитура, таймлайн и легенда берут их отсюда.
 * Графит: учитель с классом. Мята: класс работает сам. Серый: все вместе.
 */
export const modeFill: Record<SegmentMode, string> = {
  with_teacher: "bg-ink",
  independent: "bg-mint",
  joint: "bg-joint",
};

/** Блок с текстом внутри (таймлайн): фон и цвет текста с достаточным контрастом. */
export const modeBlock: Record<SegmentMode, string> = {
  with_teacher: "bg-ink text-white",
  independent: "bg-mint text-ink",
  joint: "bg-joint text-ink",
};

/** Подпись режима внутри блока: чуть тише основного текста. */
export const modeLabel: Record<SegmentMode, string> = {
  with_teacher: "text-white/70",
  independent: "text-ink/65",
  joint: "text-ink/65",
};
