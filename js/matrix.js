// Расчёт матрицы судьбы по дате рождения (метод 22 арканов).
// Все числа приводятся к диапазону 1–22: если число больше 22,
// складываем его цифры (повторяем, пока не станет ≤ 22).

export function reduce(n) {
  n = Math.abs(Math.trunc(n));
  while (n > 22) {
    n = String(n).split('').reduce((s, d) => s + Number(d), 0);
  }
  return n === 0 ? 22 : n;
}

const r = (...nums) => reduce(nums.reduce((s, x) => s + x, 0));

/**
 * Разбирает строку даты «ДД.ММ.ГГГГ». Возвращает {day, month, year} или null.
 */
export function parseDate(str) {
  const m = String(str || '').trim().match(/^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2100) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;
  return { day, month, year };
}

export function formatDate({ day, month, year }) {
  return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
}

/**
 * Основной расчёт. Обозначения:
 *  A — день (левая точка), B — месяц (верх), C — сумма цифр года (право),
 *  D — A+B+C (низ), E — центр (A+B+C+D).
 *  Родовой квадрат: F = A+B (лево-верх), G = B+C (право-верх),
 *                   H = C+D (право-низ), I = D+A (лево-низ).
 *  Внутренние точки к центру: a2 = A+E и т. д.; промежуточные: a1 = A+a2 и т. д.
 */
export function calcMatrix({ day, month, year }) {
  const A = reduce(day);
  const B = reduce(month);
  const C = reduce(String(year).split('').reduce((s, d) => s + Number(d), 0));
  const D = r(A, B, C);
  const E = r(A, B, C, D);

  const F = r(A, B);
  const G = r(B, C);
  const H = r(C, D);
  const I = r(D, A);

  const a2 = r(A, E), b2 = r(B, E), c2 = r(C, E), d2 = r(D, E);
  const a1 = r(A, a2), b1 = r(B, b2), c1 = r(C, c2), d1 = r(D, d2);

  // Линия денег и любви: точка пересечения X между внутренними точками C и D.
  const X = r(c2, d2);
  const money = r(c2, X);
  const love = r(d2, X);

  // Предназначения
  const sky = r(B, D);
  const earth = r(A, C);
  const personal = r(sky, earth);
  const male = r(F, H);
  const female = r(G, I);
  const social = r(male, female);
  const spiritual = r(personal, social);
  const planetary = r(social, spiritual);

  return {
    A, B, C, D, E, F, G, H, I,
    a1, a2, b1, b2, c1, c2, d1, d2,
    X, money, love,
    tail: [d2, d1, D], // принято записывать от центра к краю
    talents: [B, b1, b2],
    purpose: { sky, earth, personal, male, female, social, spiritual, planetary },
  };
}
