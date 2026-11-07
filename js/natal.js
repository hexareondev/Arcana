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

// ── Синастрия ──────────────────────────────────────
const SYN_ORBS = { conjunction: 7, opposition: 7, trine: 6, square: 6, sextile: 4 };

/** Точки карты для синастрии: 10 планет + асцендент, если известно время. */
function synPoints(c) {
  const pts = c.planets.filter((p) => p.key !== 'node').map((p) => ({ key: p.key, lon: p.lon }));
  if (c.houses) pts.push({ key: 'asc', lon: c.houses.asc });
  return pts;
}

// Сферы совместимости: какие пары планет к ним относятся
const SYN_CATS = {
  emotions: (a, b) => a === 'moon' || b === 'moon',
  attraction: (a, b) => {
    const s = new Set([a, b]);
    return (s.has('venus') && s.has('mars')) || (s.has('mars') && (s.has('sun') || s.has('moon') || s.has('pluto') || s.has('asc')))
      || (s.has('venus') && s.has('pluto')) || (a === 'mars' && b === 'mars');
  },
  communication: (a, b) => a === 'mercury' || b === 'mercury',
  love: (a, b) => (a === 'venus' || b === 'venus') && ['sun', 'moon', 'venus', 'jupiter', 'asc', 'mars'].includes(a === 'venus' ? b : a),
  longterm: (a, b) => a === 'saturn' || b === 'saturn' || a === 'jupiter' || b === 'jupiter',
};

export function calcSynastry(c1, c2) {
  const p1 = synPoints(c1), p2 = synPoints(c2);
  const aspects = [];
  for (const x of p1) {
    for (const y of p2) {
      const d = angDist(x.lon, y.lon);
      const bonus = (LUMINARY.has(x.key) || LUMINARY.has(y.key)) ? 1 : 0;
      for (const asp of ASPECTS) {
        const orb = Math.abs(d - asp.angle);
        if (orb <= SYN_ORBS[asp.key] + bonus) {
          aspects.push({ a: x.key, b: y.key, type: asp.key, orb, max: SYN_ORBS[asp.key] + bonus });
          break;
        }
      }
    }
  }
  aspects.sort((x, y) => x.orb - y.orb);

  // Шкалы 0–100: мягкие аспекты поднимают, напряжённые опускают (в «притяжении» дают искру)
  const scores = {};
  for (const [cat, test] of Object.entries(SYN_CATS)) {
    let v = 58, n = 0;
    for (const a of aspects) {
      if (!test(a.a, a.b)) continue;
      const w = 1 - a.orb / (a.max + 1);
      n++;
      const saturn = a.a === 'saturn' || a.b === 'saturn';
      if (a.type === 'trine' || a.type === 'sextile') v += (a.type === 'trine' ? 15 : 11) * w;
      else if (a.type === 'conjunction') v += (saturn ? 6 : 13) * w;
      else if (cat === 'attraction') v += 7 * w;
      else v -= (saturn ? 12 : 9) * w;
    }
    scores[cat] = { value: Math.round(Math.max(8, Math.min(97, v))), count: n };
  }
  const vals = Object.values(scores).map((x) => x.value);
  const total = Math.round(vals.reduce((s, x) => s + x, 0) / vals.length);

  // Наложение домов: планеты одного в домах другого
  const overlay = (from, to) => (to.houses ? from.planets.filter((p) => p.key !== 'node').map((p) => ({ key: p.key, house: houseOf(p.lon, to.houses.cusps) })) : null);

  return { aspects, scores, total, overlayAinB: overlay(c1, c2), overlayBinA: overlay(c2, c1) };
}

// ── Транзиты ───────────────────────────────────────
export const TRANSIT_BODIES = ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];
const TR_ORB = { sun: 1.5, mercury: 1.5, venus: 1.5, mars: 2, jupiter: 2, saturn: 2, uranus: 2, neptune: 2, pluto: 2 };
export const SLOW = ['jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

/** Положения планет (и Луны) в момент ms. */
export function skyAt(ms) {
  const t = A.MakeTime(new Date(ms));
  const t1 = A.MakeTime(new Date(ms + 86400000));
  return ['sun', 'moon', ...TRANSIT_BODIES.slice(1)].map((key) => {
    const lon = bodyLon(key, t);
    const next = bodyLon(key, t1);
    const speed = norm(next - lon + 180) - 180;
    return { key, lon, sign: signOf(lon), deg: degInSign(lon), retro: key !== 'sun' && key !== 'moon' && speed < 0, speed };
  });
}

function natalTargets(c) {
  const pts = c.planets.filter((p) => p.key !== 'node').map((p) => ({ key: p.key, lon: p.lon }));
  if (c.houses) { pts.push({ key: 'asc', lon: c.houses.asc }); pts.push({ key: 'mc', lon: c.houses.mc }); }
  return pts;
}

/** Транзитные аспекты к натальной карте на момент ms. */
export function calcTransits(natal, ms) {
  const sky = skyAt(ms);
  const skyNext = skyAt(ms + 86400000);
  const targets = natalTargets(natal);
  const out = [];
  for (const tp of sky) {
    if (tp.key === 'moon') continue;
    const tn = skyNext.find((x) => x.key === tp.key);
    for (const np of targets) {
      const d = angDist(tp.lon, np.lon);
      for (const asp of ASPECTS) {
        const orb = Math.abs(d - asp.angle);
        if (orb <= TR_ORB[tp.key]) {
          const orbNext = Math.abs(angDist(tn.lon, np.lon) - asp.angle);
          out.push({ t: tp.key, n: np.key, type: asp.key, orb, applying: orbNext < orb });
          break;
        }
      }
    }
  }
  return { sky, aspects: out };
}

/**
 * Точные транзиты медленных планет к главным точкам карты за период.
 * Шаг — сутки; момент точности уточняется линейно между днями.
 */
export function upcomingTransits(natal, fromMs, days = 365) {
  const keys = new Set(['sun', 'moon', 'mercury', 'venus', 'mars', 'asc', 'mc']);
  const targets = natalTargets(natal).filter((p) => keys.has(p.key));
  const DAY = 86400000;
  const events = [];
  let prev = null;
  for (let i = 0; i <= days; i++) {
    const ms = fromMs + i * DAY;
    const t = A.MakeTime(new Date(ms));
    const lons = Object.fromEntries(SLOW.map((k) => [k, bodyLon(k, t)]));
    if (prev) {
      for (const k of SLOW) {
        for (const np of targets) {
          for (const asp of ASPECTS) {
            // знаковое отклонение от точного угла: разность долгот минус угол аспекта (в обе стороны)
            for (const sgn of asp.angle === 0 || asp.angle === 180 ? [1] : [1, -1]) {
              const target = norm(np.lon + sgn * asp.angle);
              const d0 = norm(prev.lons[k] - target + 180) - 180;
              const d1 = norm(lons[k] - target + 180) - 180;
              if (Math.abs(d0) < 5 && Math.abs(d1) < 5 && (d0 === 0 || Math.sign(d0) !== Math.sign(d1))) {
                const f = d0 / (d0 - d1 || 1);
                events.push({ ms: prev.ms + f * DAY, t: k, n: np.key, type: asp.key });
              }
            }
          }
        }
      }
    }
    prev = { ms, lons };
  }
  return events.sort((a, b) => a.ms - b.ms);
}
