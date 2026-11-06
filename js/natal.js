// Натальная карта: перевод времени, положения планет, дома, аспекты.
// Астрономия — библиотека astronomy-engine (MIT), vendor/astronomy.min.js.

let A = typeof window !== 'undefined' ? window.Astronomy : null;

export function setAstronomy(lib) { A = lib; }

let loading = null;
export function loadAstronomy(src = 'vendor/astronomy.min.js?v=2.1.19') {
  if (A) return Promise.resolve(A);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { A = window.Astronomy; resolve(A); };
    s.onerror = () => { loading = null; reject(new Error('Не удалось загрузить астрономическую библиотеку')); };
    document.head.appendChild(s);
  });
  return loading;
}

// ── Время ──────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');

/** Смещение пояса (в минутах) в момент utcMs. zone — IANA («Asia/Novosibirsk») или «UTC+07:00». */
export function tzOffset(zone, utcMs) {
  const fixed = /^UTC([+-])(\d{1,2}):?(\d{2})?$/.exec(zone);
  if (fixed) return (fixed[1] === '-' ? -1 : 1) * (Number(fixed[2]) * 60 + Number(fixed[3] || 0));
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** Местное время → UTC (мс). Возвращает { utc, offset } (offset в минутах). */
export function localToUtc({ year, month, day, hour, minute }, zone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off1 = tzOffset(zone, guess);
  let utc = guess - off1 * 60000;
  const off2 = tzOffset(zone, utc);
  if (off2 !== off1) utc = guess - off2 * 60000;
  return { utc, offset: tzOffset(zone, utc) };
}

export function formatOffset(min) {
  const s = min < 0 ? '−' : '+';
  const a = Math.abs(min);
  return `UTC${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

export function isValidZone(zone) {
  if (/^UTC[+-]\d{1,2}(:?\d{2})?$/.test(zone)) return true;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
}

// ── Математика ─────────────────────────────────────
const RAD = Math.PI / 180;
const norm = (x) => ((x % 360) + 360) % 360;
const sin = (d) => Math.sin(d * RAD), cos = (d) => Math.cos(d * RAD), tan = (d) => Math.tan(d * RAD);
const atan2d = (y, x) => Math.atan2(y, x) / RAD;
const asind = (x) => Math.asin(Math.max(-1, Math.min(1, x))) / RAD;
const acosd = (x) => Math.acos(Math.max(-1, Math.min(1, x))) / RAD;

/** Угловое расстояние 0..180 */
export const angDist = (a, b) => { const d = Math.abs(norm(a - b)); return d > 180 ? 360 - d : d; };

// ── Знаки ──────────────────────────────────────────
export const SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
export const ELEMENT = ['fire', 'earth', 'air', 'water'];
export const MODALITY = ['cardinal', 'fixed', 'mutable'];
export const signOf = (lon) => Math.floor(norm(lon) / 30);
export const degInSign = (lon) => norm(lon) % 30;
export function formatDeg(lon) {
  const d = degInSign(lon);
  let deg = Math.floor(d), min = Math.round((d - deg) * 60);
  if (min === 60) { deg += 1; min = 0; }
  return `${deg}°${pad(min)}′`;
}

// ── Тела ───────────────────────────────────────────
export const BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'node'];
const LIB_NAME = { sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto' };

function bodyLon(key, t) {
  if (key === 'sun') return A.SunPosition(t).elon;
  if (key === 'moon') return A.EclipticGeoMoon(t).lon;
  if (key === 'node') {
    // Средний восходящий лунный узел (Meeus), T — юлианские столетия от J2000 (TT)
    const T = t.tt / 36525;
    return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T * T * T / 467441);
  }
  const v = A.GeoVector(LIB_NAME[key], t, true);
  const ecl = A.RotateVector(A.Rotation_EQJ_ECT(t), v);
  return norm(A.SphereFromVector(ecl).lon);
}

// ── Дома (Плацидус; за полярным кругом — Порфирий) ─
function eclFromRA(ra, eps) { return norm(atan2d(sin(ra), cos(ra) * cos(eps))); }

function placidusCusp(ramc, eps, lat, frac, east) {
  // east: дома 11/12 (RA = RAMC + f·ДПД), иначе 9/8 (RA = RAMC − f·ДПД)
  let ra = ramc + (east ? 1 : -1) * frac * 90;
  for (let i = 0; i < 50; i++) {
    const lon = eclFromRA(ra, eps);
    const decl = asind(sin(eps) * sin(lon));
    const x = -tan(lat) * tan(decl);
    if (Math.abs(x) > 1) return null;
    const dsa = acosd(x);
    const next = ramc + (east ? 1 : -1) * frac * dsa;
    if (Math.abs(angDist(next, ra)) < 1e-7) { ra = next; break; }
    ra = next;
  }
  return eclFromRA(ra, eps);
}

export function calcHouses(t, lat, lon) {
  const tilt = A.e_tilt(t);
  const eps = tilt.tobl;
  const ramc = norm(A.SiderealTime(t) * 15 + lon);
  const mc = norm(atan2d(sin(ramc), cos(ramc) * cos(eps)));
  const asc = norm(atan2d(cos(ramc), -(sin(ramc) * cos(eps) + tan(lat) * sin(eps))));

  const cusps = new Array(12);
  cusps[0] = asc; cusps[9] = mc;
  cusps[6] = norm(asc + 180); cusps[3] = norm(mc + 180);
  let system = 'placidus';
  const c11 = placidusCusp(ramc, eps, lat, 1 / 3, true);
  const c12 = placidusCusp(ramc, eps, lat, 2 / 3, true);
  const c9 = placidusCusp(ramc, eps, lat, 1 / 3, false);
  const c8 = placidusCusp(ramc, eps, lat, 2 / 3, false);
  if ([c11, c12, c9, c8].some((x) => x === null)) {
    system = 'porphyry';
    const q1 = norm(asc - mc);       // MC → ASC
    const q2 = norm(mc + 180 - asc); // ASC → IC
    cusps[10] = norm(mc + q1 / 3); cusps[11] = norm(mc + 2 * q1 / 3);
    cusps[1] = norm(asc + q2 / 3); cusps[2] = norm(asc + 2 * q2 / 3);
  } else {
    cusps[10] = c11; cusps[11] = c12;
    cusps[8] = c9; cusps[7] = c8;
    cusps[1] = norm(c8 + 180); cusps[2] = norm(c9 + 180);
  }
  cusps[4] = norm(cusps[10] + 180); cusps[5] = norm(cusps[11] + 180);
  cusps[7] = norm(cusps[1] + 180); cusps[8] = norm(cusps[2] + 180);
  return { cusps, asc, mc, system };
}

export function houseOf(lon, cusps) {
  for (let i = 0; i < 12; i++) {
    const a = cusps[i], b = cusps[(i + 1) % 12];
    const span = norm(b - a);
    if (norm(lon - a) < span) return i + 1;
  }
  return 1;
}

// ── Аспекты ────────────────────────────────────────
export const ASPECTS = [
  { key: 'conjunction', angle: 0, orb: 8 },
  { key: 'opposition', angle: 180, orb: 8 },
  { key: 'trine', angle: 120, orb: 7 },
  { key: 'square', angle: 90, orb: 7 },
  { key: 'sextile', angle: 60, orb: 5 },
];
const LUMINARY = new Set(['sun', 'moon']);

export function calcAspects(planets) {
  const keys = planets.filter((p) => p.key !== 'node').map((p) => p.key);
  const lon = Object.fromEntries(planets.map((p) => [p.key, p.lon]));
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      const d = angDist(lon[a], lon[b]);
      const bonus = (LUMINARY.has(a) || LUMINARY.has(b)) ? 2 : 0;
      for (const asp of ASPECTS) {
        const orb = Math.abs(d - asp.angle);
        if (orb <= asp.orb + bonus) { out.push({ a, b, type: asp.key, orb }); break; }
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}

// ── Карта целиком ──────────────────────────────────
/**
 * input: { year, month, day, hour, minute, timeKnown, lat, lon, zone }
 */
export function calcNatal(input) {
  const { timeKnown = true } = input;
  const h = timeKnown ? input.hour : 12, mi = timeKnown ? input.minute : 0;
  const { utc, offset } = localToUtc({ ...input, hour: h, minute: mi }, input.zone);
  const t = A.MakeTime(new Date(utc));
  const tPrev = A.MakeTime(new Date(utc - 43200000));
  const tNext = A.MakeTime(new Date(utc + 43200000));

  const houses = timeKnown ? calcHouses(t, input.lat, input.lon) : null;
  const planets = BODIES.map((key) => {
    const lon = bodyLon(key, t);
    const speed = key === 'node' ? -0.053 : ((norm(bodyLon(key, tNext) - bodyLon(key, tPrev) + 180) - 180));
    return {
      key, lon,
      sign: signOf(lon),
      deg: degInSign(lon),
      retro: key !== 'sun' && key !== 'moon' && key !== 'node' && speed < 0,
      house: houses ? houseOf(lon, houses.cusps) : null,
    };
  });

  // Баланс стихий и крестов (10 планет + асцендент, Солнце/Луна/Асцендент весят по 2)
  const elements = [0, 0, 0, 0], modalities = [0, 0, 0];
  const weigh = (lon, w) => { const s = signOf(lon); elements[s % 4] += w; modalities[s % 3] += w; };
  planets.filter((p) => p.key !== 'node').forEach((p) => weigh(p.lon, LUMINARY.has(p.key) ? 2 : 1));
  if (houses) weigh(houses.asc, 2);

  return {
    utc, offset, timeKnown,
    planets,
    houses,
    aspects: calcAspects(planets),
    elements, modalities,
  };
}
