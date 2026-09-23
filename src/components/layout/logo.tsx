/** Логотип «СНАБТЕХ.КОМАНДА — Сервисы для управления форумом». Цвет — currentColor. */
export function Logo({
  className,
  title = 'СНАБТЕХ.КОМАНДА',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 1745 245"
      className={className}
      role="img"
      aria-label={`${title} — Сервисы для управления форумом`}
      fill="currentColor"
      fontFamily="Arial, 'Liberation Sans', Helvetica, sans-serif"
    >
      <text x="5" y="118" fontSize="150" textLength="1495" lengthAdjust="spacingAndGlyphs">
        СНАБТЕХ.КОМАНДА
      </text>
      <rect x="8" y="201" width="309" height="6" />
      <text x="363" y="230" fontSize="56" textLength="1372" lengthAdjust="spacing">
        Сервисы для управления форумом
      </text>
    </svg>
  );
}
