-- Новая палитра карточек: бывшие «фиолетовый» и «голубой» — на ближайшие новые цвета
UPDATE "Forum" SET "color" = 'purple' WHERE "color" = 'violet';
UPDATE "Forum" SET "color" = 'turquoise' WHERE "color" = 'sky';
