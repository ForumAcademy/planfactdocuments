-- Палитра карточек из 8 цветов: прежние цвета — на ближайшие новые
UPDATE "Forum" SET "color" = 'violet' WHERE "color" IN ('purple', 'magenta', 'pink');
UPDATE "Forum" SET "color" = 'mustard' WHERE "color" IN ('coral', 'orange');
UPDATE "Forum" SET "color" = 'slate' WHERE "color" = 'ocean';
UPDATE "Forum" SET "color" = 'emerald' WHERE "color" IN ('teal', 'mint');
UPDATE "Forum" SET "color" = 'turquoise' WHERE "color" IN ('ice', 'sky');
UPDATE "Forum" SET "color" = 'blue'
WHERE "color" NOT IN ('blue', 'turquoise', 'indigo', 'emerald', 'cornflower', 'mustard', 'violet', 'slate');
