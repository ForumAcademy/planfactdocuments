/* eslint-disable @next/next/no-img-element */

/**
 * Логотип «СНАБТЕХ.КОМАНДА — Сервисы для управления форумом» (PNG на прозрачном фоне).
 * white — для тёмной шапки сайта, black — для страницы входа.
 */
export function Logo({
  className,
  variant = 'white',
}: {
  className?: string;
  variant?: 'white' | 'black';
}) {
  return (
    <img
      src={variant === 'white' ? '/logo-white.png' : '/logo-black.png'}
      width={1159}
      height={134}
      alt="СНАБТЕХ.КОМАНДА — Сервисы для управления форумом"
      className={className}
      draggable={false}
    />
  );
}
