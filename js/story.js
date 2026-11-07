// Картинка для сторис 1080×1920, рисуется на <canvas> прямо в браузере.
import { PLANETS, SIGNS_INFO, ASPECTS_INFO } from './natal-texts.js?v=12';

const W = 1080, H = 1920;
const C = {
  bg: '#0F2B26', bgLight: '#16392F', ivory: '#F1E8D8', ivory2: '#DDD3BF', muted: '#B8AF9C',
  brass: '#C9A86A', brassSoft: 'rgba(201,168,106,0.55)', brassFaint: 'rgba(201,168,106,0.22)', terra: '#D9825F',
};
const DISPLAY = 'Oranienbaum, "Times New Roman", serif';
const BODY = 'Raleway, system-ui, sans-serif';

export async function ensureFonts() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.all([
      document.fonts.load(`400 72px Oranienbaum`, 'АРКАНА'),
      document.fonts.load(`500 30px Raleway`, 'Матрица'),
      document.fonts.load(`600 30px Raleway`, 'Матрица'),
      document.fonts.load(`40px "Noto Sans Symbols"`, '☉☽♈♉'),
    ]);
  } catch { /* рисуем запасными шрифтами */ }
}

// Текст с разрядкой (letterSpacing есть не во всех браузерах — рисуем по буквам).
function spaced(ctx, text, x, y, spacing, align = 'center') {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = prev;
  return total;
}

// Подбирает размер шрифта, чтобы текст влез в ширину.
function fit(ctx, text, family, weight, size, maxWidth) {
  let s = size;
  do { ctx.font = `${weight} ${s}px ${family}`; s -= 2; } while (ctx.measureText(text).width > maxWidth && s > 20);
}

function seeded(seed) {
  let x = seed % 2147483647 || 1;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

function drawBackground(ctx, seed) {
  const grad = ctx.createRadialGradient(W / 2, 560, 80, W / 2, 760, 1300);
  grad.addColorStop(0, C.bgLight);
  grad.addColorStop(1, C.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const rnd = seeded(seed);
  for (let i = 0; i < 90; i++) {
    const x = 70 + rnd() * (W - 140), y = 70 + rnd() * (H - 140);
    const r = rnd() < 0.15 ? 2.4 : rnd() < 0.5 ? 1.6 : 1;
    ctx.globalAlpha = 0.25 + rnd() * 0.5;
    ctx.fillStyle = rnd() < 0.25 ? C.brass : C.ivory;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Двойная рамка ар-деко
  ctx.strokeStyle = C.brass; ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.strokeStyle = C.brassSoft; ctx.lineWidth = 1.5;
  ctx.strokeRect(54, 54, W - 108, H - 108);
  // Уголки
  ctx.strokeStyle = C.brass; ctx.lineWidth = 2;
  for (const [x, y, sx, sy] of [[54, 54, 1, 1], [W - 54, 54, -1, 1], [54, H - 54, 1, -1], [W - 54, H - 54, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * 46, y); ctx.lineTo(x + sx * 46, y + sy * 18);
    ctx.moveTo(x, y + sy * 46); ctx.lineTo(x + sx * 18, y + sy * 46);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x + sx * 24, y + sy * 24, 4, 0, Math.PI * 2); ctx.fillStyle = C.brass; ctx.fill();
  }
}

function drawEmblem(ctx, cx, top) {
  ctx.save();
  ctx.strokeStyle = C.brass; ctx.lineWidth = 1.6;
  const s = 1.15;
  const P = (x, y) => [cx + (x - 60) * s, top + y * s];
  ctx.beginPath();
  for (const [[x1, y1], [x2, y2]] of [[[60, 4], [60, 56]], [[30, 56], [60, 14]], [[60, 14], [90, 56]], [[10, 56], [60, 28]], [[60, 28], [110, 56]]]) {
    ctx.moveTo(...P(x1, y1)); ctx.lineTo(...P(x2, y2));
  }
  ctx.stroke();
  ctx.fillStyle = C.brass;
  ctx.beginPath(); ctx.arc(...P(60, 10), 4.5 * s, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawDivider(ctx, cx, y, color = C.brass) {
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - 140, y); ctx.lineTo(cx - 24, y); ctx.moveTo(cx + 24, y); ctx.lineTo(cx + 140, y); ctx.stroke();
  ctx.fillStyle = color; ctx.font = `18px ${BODY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('✦', cx, y + 1);
}

function drawChart(ctx, m, cx, cy, scale) {
  const P = (x, y) => [cx + (x - 180) * scale, cy + (y - 180) * scale];
  const OUT = 150, MID = 104, IN = 62, SQ = 106, C0 = 180;
  ctx.save();
  ctx.lineWidth = 1.6;

  ctx.strokeStyle = 'rgba(201,168,106,0.35)';
  ctx.beginPath(); ctx.arc(cx, cy, OUT * scale, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([2, 10]); ctx.strokeStyle = 'rgba(201,168,106,0.3)';
  ctx.beginPath(); ctx.arc(cx, cy, (OUT + 10) * scale, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(201,168,106,0.25)';
  ctx.beginPath();
  ctx.moveTo(...P(C0 - SQ, C0 - SQ)); ctx.lineTo(...P(C0 + SQ, C0 + SQ));
  ctx.moveTo(...P(C0 + SQ, C0 - SQ)); ctx.lineTo(...P(C0 - SQ, C0 + SQ));
  ctx.moveTo(...P(C0 - OUT, C0)); ctx.lineTo(...P(C0 + OUT, C0));
  ctx.moveTo(...P(C0, C0 - OUT)); ctx.lineTo(...P(C0, C0 + OUT));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(201,168,106,0.6)';
  ctx.strokeRect(...P(C0 - SQ, C0 - SQ), SQ * 2 * scale, SQ * 2 * scale);
  ctx.strokeStyle = C.brass; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(...P(C0 - OUT, C0)); ctx.lineTo(...P(C0, C0 - OUT)); ctx.lineTo(...P(C0 + OUT, C0)); ctx.lineTo(...P(C0, C0 + OUT)); ctx.closePath();
  ctx.stroke();

  const pts = [
    ['A', C0 - OUT, C0, 'outer'], ['B', C0, C0 - OUT, 'outer'], ['C', C0 + OUT, C0, 'outer'], ['D', C0, C0 + OUT, 'outer'],
    ['F', C0 - SQ, C0 - SQ, 'anc'], ['G', C0 + SQ, C0 - SQ, 'anc'], ['H', C0 + SQ, C0 + SQ, 'anc'], ['I', C0 - SQ, C0 + SQ, 'anc'],
    ['a1', C0 - MID, C0, 'in'], ['a2', C0 - IN, C0, 'in'], ['b1', C0, C0 - MID, 'in'], ['b2', C0, C0 - IN, 'in'],
    ['c1', C0 + MID, C0, 'in'], ['c2', C0 + IN, C0, 'in'], ['d1', C0, C0 + MID, 'in'], ['d2', C0, C0 + IN, 'in'],
    ['E', C0, C0, 'center'],
  ];
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [key, x, y, kind] of pts) {
    const [px, py] = P(x, y);
    ctx.lineWidth = 2;
    if (kind === 'outer') {
      const h = 18 * scale;
      ctx.beginPath(); ctx.moveTo(px - h * 1.414, py); ctx.lineTo(px, py - h * 1.414); ctx.lineTo(px + h * 1.414, py); ctx.lineTo(px, py + h * 1.414); ctx.closePath();
      ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.brass; ctx.stroke();
      ctx.font = `400 ${18 * scale}px ${DISPLAY}`;
    } else if (kind === 'anc') {
      const h = 15 * scale;
      ctx.fillStyle = C.bg; ctx.fillRect(px - h, py - h, h * 2, h * 2);
      ctx.strokeStyle = C.terra; ctx.strokeRect(px - h, py - h, h * 2, h * 2);
      ctx.font = `400 ${16 * scale}px ${DISPLAY}`;
    } else if (kind === 'in') {
      ctx.beginPath(); ctx.arc(px, py, 12 * scale, 0, Math.PI * 2);
      ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.brassSoft; ctx.stroke();
      ctx.font = `400 ${12 * scale}px ${DISPLAY}`;
    } else {
      ctx.save();
      ctx.shadowColor = 'rgba(201,168,106,0.8)'; ctx.shadowBlur = 40;
      ctx.beginPath(); ctx.arc(px, py, 27 * scale, 0, Math.PI * 2); ctx.fillStyle = C.brass; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(px, py, 22 * scale, 0, Math.PI * 2); ctx.strokeStyle = C.bg; ctx.stroke();
      ctx.font = `400 ${22 * scale}px ${DISPLAY}`;
    }
    ctx.fillStyle = kind === 'center' ? C.bg : C.ivory;
    ctx.fillText(String(m[key]), px, py + 2);
  }
  ctx.restore();
}

/**
 * opts: { kind: 'single'|'pair', title, name, sub, m, center: {label, n}, items: [{label, n}] (3 шт.), url, arc }
 * arc(n) → { name, roman, keys }
 */
export async function drawStory(opts) {
  await ensureFonts();
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const cx = W / 2;
  const seed = Object.values(opts.m).filter((v) => typeof v === 'number').reduce((s, v) => s * 31 + v, 7);

  drawBackground(ctx, seed);
  drawEmblem(ctx, cx, 118);

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ivory; ctx.font = `400 104px ${DISPLAY}`;
  spaced(ctx, 'АРКАНА', cx, 300, 20);

  ctx.fillStyle = C.brass; ctx.font = `500 28px ${BODY}`;
  spaced(ctx, opts.title, cx, 360, 9);

  let y = 450;
  if (opts.name) {
    ctx.fillStyle = C.ivory;
    fit(ctx, opts.name, DISPLAY, 400, 68, W - 220);
    ctx.fillText(opts.name, cx, y);
    y += 58;
  } else {
    y -= 20;
  }
  ctx.fillStyle = C.muted; ctx.font = `500 32px ${BODY}`;
  spaced(ctx, opts.sub, cx, y, 3);

  // Схема
  drawChart(ctx, opts.m, cx, 938, 2.15);

  // Главный аркан
  const a = opts.arc(opts.center.n);
  drawDivider(ctx, cx, 1354);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.brass; ctx.font = `500 26px ${BODY}`;
  spaced(ctx, opts.center.label.toUpperCase(), cx, 1412, 8);
  ctx.fillStyle = C.ivory;
  fit(ctx, `${a.roman} · ${a.name}`, DISPLAY, 400, 84, W - 200);
  ctx.fillText(`${a.roman} · ${a.name}`, cx, 1508);
  ctx.fillStyle = C.ivory2; ctx.font = `400 32px ${BODY}`;
  ctx.fillText(a.keys.join('  ·  '), cx, 1562);

  // Три точки
  const colW = (W - 200) / 3;
  const top = 1630;
  ctx.strokeStyle = C.brassFaint; ctx.lineWidth = 1.5;
  ctx.strokeRect(100, top, W - 200, 170);
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(100 + colW * i, top + 22); ctx.lineTo(100 + colW * i, top + 148); ctx.stroke();
  }
  opts.items.forEach((it, i) => {
    const x = 100 + colW * i + colW / 2;
    const ai = opts.arc(it.n);
    ctx.fillStyle = C.brass; ctx.font = `600 21px ${BODY}`;
    spaced(ctx, it.label.toUpperCase(), x, top + 46, 4);
    ctx.fillStyle = C.ivory; ctx.font = `400 54px ${DISPLAY}`;
    ctx.fillText(String(it.n), x, top + 106);
    ctx.fillStyle = C.ivory2;
    fit(ctx, ai.name, BODY, 500, 25, colW - 24);
    ctx.fillText(ai.name, x, top + 146);
  });

  // Подпись
  ctx.fillStyle = C.brass; ctx.font = `500 24px ${BODY}`;
  spaced(ctx, `✦  ${opts.url}  ✦`, cx, H - 82, 2);

  return cv;
}

// ── Натальная карта ────────────────────────────────
const SYM = '"Noto Sans Symbols", "Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif';
const TXT = '\uFE0E';
const EL_COLOR = { fire: '#E3966F', earth: '#C9A86A', air: '#DDD3BF', water: '#8FC1B5' };

function drawNatalWheel(ctx, chart, cx, cy, k) {
  const asc = chart.houses ? chart.houses.asc : 0;
  const R = { out: 292 * k, zod: 250 * k, house: 214 * k, plan: 186 * k, asp: 128 * k, inner: 64 * k };
  const ang = (lon) => (180 + (lon - asc)) * Math.PI / 180;
  const pt = (lon, r) => [cx + r * Math.cos(ang(lon)), cy - r * Math.sin(ang(lon))];
  const line = (a, b) => { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); };
  const circle = (r) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); };

  ctx.save();
  ctx.fillStyle = 'rgba(10,32,28,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, R.out, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.brass; ctx.lineWidth = 2.2; circle(R.out); circle(R.zod);
  ctx.strokeStyle = 'rgba(201,168,106,0.35)'; ctx.lineWidth = 1.6; circle(R.house); circle(R.asp); circle(R.inner);

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = 'rgba(201,168,106,0.55)'; ctx.lineWidth = 1.6;
    line(pt(i * 30, R.zod), pt(i * 30, R.out));
    ctx.strokeStyle = 'rgba(201,168,106,0.4)'; ctx.lineWidth = 1.2;
    for (let d = 5; d < 30; d += 5) line(pt(i * 30 + d, R.zod), pt(i * 30 + d, R.zod - (d % 10 ? 5 : 10) * k));
    ctx.fillStyle = EL_COLOR[SIGNS_INFO[i].element];
    ctx.font = `${30 * k}px ${SYM}`;
    ctx.fillText(SIGNS_INFO[i].glyph + TXT, ...pt(i * 30 + 15, (R.zod + R.out) / 2));
  }

  if (chart.houses) {
    chart.houses.cusps.forEach((lon, i) => {
      const axis = i % 3 === 0;
      ctx.strokeStyle = axis ? 'rgba(201,168,106,0.95)' : 'rgba(201,168,106,0.35)';
      ctx.lineWidth = axis ? 3 : 1.5;
      line(pt(lon, R.inner), pt(lon, axis ? R.zod : R.house));
      const next = chart.houses.cusps[(i + 1) % 12];
      ctx.fillStyle = C.muted; ctx.font = `500 ${15 * k}px ${BODY}`;
      ctx.fillText(String(i + 1), ...pt(lon + ((next - lon + 360) % 360) / 2, R.inner + 19 * k));
    });
    ctx.fillStyle = C.terra; ctx.font = `600 ${15 * k}px ${BODY}`;
    ctx.fillText('ASC', ...pt(chart.houses.asc + 7, R.house + 18 * k));
    ctx.fillText('MC', ...pt(chart.houses.mc + 6, R.house + 18 * k));
  }

  // Аспекты
  const lonOf = Object.fromEntries(chart.planets.map((p) => [p.key, p.lon]));
  for (const a of chart.aspects) {
    if (a.type === 'conjunction') continue;
    const tense = ASPECTS_INFO[a.type].nature === 'tense';
    ctx.strokeStyle = tense ? 'rgba(217,130,95,' : 'rgba(201,168,106,';
    ctx.strokeStyle += Math.max(0.35, 1 - a.orb / 9).toFixed(2) + ')';
    ctx.lineWidth = 2;
    line(pt(lonOf[a.a], R.asp), pt(lonOf[a.b], R.asp));
  }

  // Планеты: раздвигаем, чтобы не налезали
  const pos = [...chart.planets].sort((a, b) => a.lon - b.lon).map((p) => ({ ...p, disp: p.lon }));
  for (let it = 0; it < 40; it++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      const a = pos[i], b = pos[(i + 1) % pos.length];
      const gap = (b.disp - a.disp + 360) % 360;
      if (gap < 9.5) { const push = (9.5 - gap) / 2; a.disp -= push; b.disp += push; moved = true; }
    }
    if (!moved) break;
  }
  for (const p of pos) {
    ctx.strokeStyle = C.ivory; ctx.lineWidth = 2.4;
    line(pt(p.lon, R.house), pt(p.lon, R.house - 11 * k));
    ctx.fillStyle = C.ivory;
    ctx.beginPath(); ctx.arc(...pt(p.lon, R.asp), 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${31 * k}px ${SYM}`;
    ctx.fillText(PLANETS[p.key].glyph + TXT, ...pt(p.disp, R.plan));
    ctx.fillStyle = C.muted; ctx.font = `500 ${14 * k}px ${BODY}`;
    ctx.fillText(`${Math.floor(p.deg)}°${p.retro ? 'R' : ''}`, ...pt(p.disp, R.plan - 33 * k));
  }
  ctx.restore();
}

/** opts: { name, sub, chart, url } */
export async function drawNatalStory(opts) {
  await ensureFonts();
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const cx = W / 2;
  const { chart } = opts;
  const seed = Math.floor(chart.planets.reduce((s, p) => s + p.lon * 1000, 0)) % 2147483647;

  drawBackground(ctx, seed);
  drawEmblem(ctx, cx, 118);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.ivory; ctx.font = `400 104px ${DISPLAY}`;
  spaced(ctx, 'АРКАНА', cx, 300, 20);
  ctx.fillStyle = C.brass; ctx.font = `500 28px ${BODY}`;
  spaced(ctx, 'НАТАЛЬНАЯ КАРТА', cx, 360, 9);

  let y = 448;
  if (opts.name) {
    ctx.fillStyle = C.ivory; fit(ctx, opts.name, DISPLAY, 400, 64, W - 220);
    ctx.fillText(opts.name, cx, y); y += 54;
  } else y -= 22;
  ctx.fillStyle = C.muted; fit(ctx, opts.sub, BODY, 500, 30, W - 200);
  ctx.fillText(opts.sub, cx, y);

  drawNatalWheel(ctx, chart, cx, 968, 1.37);

  // Большая тройка
  const P = (k) => chart.planets.find((p) => p.key === k);
  const items = [
    { label: 'Солнце', glyph: '☉', sign: P('sun').sign },
    { label: 'Луна', glyph: '☽', sign: P('moon').sign },
    chart.houses ? { label: 'Асцендент', glyph: 'AC', sign: Math.floor(chart.houses.asc / 30) } : { label: 'Асцендент', glyph: 'AC', sign: null },
  ];
  const top = 1430, colW = (W - 200) / 3;
  ctx.strokeStyle = C.brassFaint; ctx.lineWidth = 1.5;
  ctx.strokeRect(100, top, W - 200, 230);
  for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(100 + colW * i, top + 26); ctx.lineTo(100 + colW * i, top + 204); ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  items.forEach((it, i) => {
    const x = 100 + colW * i + colW / 2;
    ctx.fillStyle = C.brass; ctx.font = `600 21px ${BODY}`;
    spaced(ctx, it.label.toUpperCase(), x, top + 50, 4);
    ctx.fillStyle = C.brass;
    ctx.font = it.glyph === 'AC' ? `600 40px ${BODY}` : `52px ${SYM}`;
    ctx.fillText(it.glyph === 'AC' ? 'AC' : it.glyph + TXT, x, top + 118);
    ctx.fillStyle = C.ivory;
    if (it.sign == null) { ctx.font = `400 30px ${DISPLAY}`; ctx.fillText('—', x, top + 178); }
    else { fit(ctx, SIGNS_INFO[it.sign].name, DISPLAY, 400, 40, colW - 24); ctx.fillText(SIGNS_INFO[it.sign].name, x, top + 182); }
  });

  // Стихия
  const els = ['fire', 'earth', 'air', 'water'];
  const total = chart.elements.reduce((a, b) => a + b, 0) || 1;
  const lead = chart.elements.indexOf(Math.max(...chart.elements));
  const leadName = { fire: 'Огонь', earth: 'Земля', air: 'Воздух', water: 'Вода' }[els[lead]];
  ctx.fillStyle = C.ivory2; ctx.font = `500 30px ${BODY}`;
  ctx.fillText(`Ведущая стихия — ${leadName} · ${Math.round(chart.elements[lead] / total * 100)}%`, cx, 1730);

  ctx.fillStyle = C.brass; ctx.font = `500 24px ${BODY}`;
  spaced(ctx, `✦  ${opts.url}  ✦`, cx, H - 82, 2);
  return cv;
}
