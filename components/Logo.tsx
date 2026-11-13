/** Знак AulSabaq: арка (дверь школы) на мятном квадрате. Тот же рисунок в app/icon.svg. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-grid size-7 place-items-center rounded-[7px] bg-mint ${className}`}>
      <svg viewBox="0 0 24 24" className="size-4 fill-ink">
        <path d="M2.5 21.5V12a9.5 9.5 0 0 1 19 0v9.5h-6V12a3.5 3.5 0 0 0-7 0v9.5z" />
      </svg>
    </span>
  );
}
