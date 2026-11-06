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
  if (month < 1 || month > 12 || day < 1 || year < 1800 || year > 2100) return null;
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
  // Точки рядом с центром на левом и верхнем лучах (нужны для чакры Анахата)
  const a3 = r(a2, E), b3 = r(b2, E);

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
    a1, a2, a3, b1, b2, b3, c1, c2, d1, d2,
    X, money, love,
    tail: [d2, d1, D], // принято записывать от центра к краю
    talents: [B, b1, b2],
    purpose: { sky, earth, personal, male, female, social, spiritual, planetary },
  };
}

/**
 * Карта здоровья: 7 чакр, у каждой Физика, Энергия и Эмоции (= Физика + Энергия).
 * Итог: сумма Физик, сумма Энергий, ключ здоровья = их сумма.
 */
export const CHAKRA_KEYS = ['sahasrara', 'ajna', 'vishuddha', 'anahata', 'manipura', 'svadhisthana', 'muladhara'];

export function calcHealth(m) {
  const pairs = {
    sahasrara: [m.A, m.B],
    ajna: [m.a1, m.b1],
    vishuddha: [m.a2, m.b2],
    anahata: [m.a3, m.b3],
    manipura: [m.E, m.E],
    svadhisthana: [m.c2, m.d2],
    muladhara: [m.C, m.D],
  };
  const rows = CHAKRA_KEYS.map((key) => {
    const [phys, energy] = pairs[key];
    return { key, phys, energy, emo: r(phys, energy) };
  });
  const phys = reduce(rows.reduce((s, x) => s + x.phys, 0));
  const energy = reduce(rows.reduce((s, x) => s + x.energy, 0));
  return { rows, total: { phys, energy, emo: r(phys, energy) } };
}

/**
 * Матрица совместимости: точки двух матриц складываются попарно
 * (A + A, B + B, …) и приводятся к 1–22.
 */
export function calcPair(m1, m2) {
  const out = {};
  for (const [k, v] of Object.entries(m1)) {
    if (typeof v === 'number') out[k] = r(v, m2[k]);
  }
  out.tail = [out.d2, out.d1, out.D];
  out.talents = [out.B, out.b1, out.b2];
  out.purpose = {};
  for (const k of Object.keys(m1.purpose)) out.purpose[k] = r(m1.purpose[k], m2.purpose[k]);
  return out;
}

/**
 * Прогноз по годам. По кругу матрицы — 8 опорных точек через каждые 10 лет:
 * A (0) → F (10) → B (20) → G (30) → C (40) → H (50) → D (60) → I (70) → A (80).
 * Каждое десятилетие делится на 8 отрезков по 1,25 года:
 *   5 лет:  d = X + Y;  2,5: b = X + d;  1,25: a = X + b;  3,75: c = b + d;
 *   7,5:    f = d + Y;  6,25: e = d + f;  8,75: g = f + Y.
 */
const RING = ['A', 'F', 'B', 'G', 'C', 'H', 'D', 'I'];
const STEP_LABELS = ['', '1–2', '2–3', '3–4', '5', '6–7', '7–8', '8–9'];

export function calcYears(m) {
  return RING.map((key, i) => {
    const X = m[key];
    const Y = m[RING[(i + 1) % 8]];
    const d = r(X, Y);
    const b = r(X, d);
    const a = r(X, b);
    const c = r(b, d);
    const f = r(d, Y);
    const e = r(d, f);
    const gg = r(f, Y);
    const from = i * 10;
    const values = [X, a, b, c, d, e, f, gg];
    const points = values.map((value, k) => {
      let label;
      if (k === 0) label = String(from);
      else if (k === 4) label = String(from + 5);
      else {
        const [lo, hi] = STEP_LABELS[k].split('–').map(Number);
        label = `${from + lo}–${from + hi}`;
      }
      return { k, start: from + k * 1.25, label, value };
    });
    return { from, to: from + 10, key, points };
  });
}

/** Возраст в годах (дробный) на дату today. */
export function ageAt({ day, month, year }, today = new Date()) {
  const birth = new Date(year, month - 1, day);
  let full = today.getFullYear() - year;
  const thisYearBirthday = new Date(today.getFullYear(), month - 1, day);
  if (today < thisYearBirthday) full -= 1;
  const last = new Date(year + full, month - 1, day);
  const next = new Date(year + full + 1, month - 1, day);
  return full + (today - last) / (next - last) * (birth <= today ? 1 : 0);
}

/** Какая точка прогноза активна в возрасте age: { decade, k }. Цикл повторяется после 80. */
export function activePoint(age) {
  if (age < 0) return null;
  const a = age % 80;
  const decade = Math.floor(a / 10);
  const k = Math.min(7, Math.floor((a - decade * 10) / 1.25));
  return { decade, k };
}
