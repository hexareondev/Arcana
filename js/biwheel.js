// Двойной круг: внутреннее кольцо — натальная карта (с домами), внешнее — второй набор планет
// (партнёр в синастрии или небо в транзитах). Линии — аспекты между кольцами.
import { formatDeg } from './natal.js?v=9';
import { PLANETS, SIGNS_INFO, ASPECTS_INFO } from './natal-texts.js?v=9';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gl = (s) => s + '︎';
const OUTER = new Set(['uranus', 'neptune', 'pluto']);

const CX = 300, CY = 300;
const R_OUT = 292, R_ZOD = 250, R_B = 210, R_BG = 231, R_AG = 184, R_ADEG = 160, R_ASP = 126, R_IN = 62;

function spread(points, min) {
  const pos = [...points].sort((a, b) => a.lon - b.lon).map((p) => ({ ...p, disp: p.lon }));
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      const a = pos[i], b = pos[(i + 1) % pos.length];
      const gap = (b.disp - a.disp + 360) % 360;
      if (pos.length > 1 && gap < min) { const push = (min - gap) / 2; a.disp -= push; b.disp += push; moved = true; }
    }
    if (!moved) break;
  }
  return pos;
}

/**
 * opts: {
 *   inner: натальная карта { planets, houses },
 *   outer: [{ key, lon, sign, deg, retro }],
 *   aspects: [{ a (ключ внутреннего), b (ключ внешнего), type, orb, max }],
 *   labelA, labelB — подписи для экранных читалок,
 *   skipOuterPairs — не рисовать аспекты между высшими планетами,
 *   onPick(id) — id: 'A'+ключ или 'B'+ключ,
 *   play(svg) — запустить анимацию появления
 * }
 */
export function drawBiWheel(svg, opts) {
  const { inner, outer, aspects, labelA, labelB, onPick, play, skipOuterPairs = true } = opts;
  const asc = inner.houses ? inner.houses.asc : 0;
  const ang = (lon) => (180 + (lon - asc)) * Math.PI / 180;
  const pt = (lon, r) => [CX + r * Math.cos(ang(lon)), CY - r * Math.sin(ang(lon))];
  const f = (n) => n.toFixed(2);
  let s = '';

  for (const [r, cls] of [[R_OUT, ''], [R_ZOD, ''], [R_B, ' soft'], [R_ASP, ' soft'], [R_IN, ' soft']]) {
    s += `<circle class="w-ring${cls}" cx="${CX}" cy="${CY}" r="${r}"/>`;
  }
  for (let i = 0; i < 12; i++) {
    const a0 = i * 30;
    const [x1, y1] = pt(a0, R_ZOD), [x2, y2] = pt(a0, R_OUT);
    s += `<line class="w-line" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
    const [tx, ty] = pt(a0 + 15, (R_ZOD + R_OUT) / 2);
    s += `<text class="w-sign el-${SIGNS_INFO[i].element}" x="${f(tx)}" y="${f(ty)}">${gl(SIGNS_INFO[i].glyph)}</text>`;
    for (let d = 5; d < 30; d += 5) {
      const [a, b] = pt(a0 + d, R_ZOD), [c, e] = pt(a0 + d, R_ZOD - (d % 10 ? 4 : 7));
      s += `<line class="w-tick" x1="${f(a)}" y1="${f(b)}" x2="${f(c)}" y2="${f(e)}"/>`;
    }
  }
  if (inner.houses) {
    inner.houses.cusps.forEach((lon, i) => {
      const axis = i % 3 === 0;
      const [x1, y1] = pt(lon, R_IN), [x2, y2] = pt(lon, axis ? R_ZOD : R_B);
      s += `<line class="w-house${axis ? ' axis' : ''}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
      const next = inner.houses.cusps[(i + 1) % 12];
      const [hx, hy] = pt(lon + ((next - lon + 360) % 360) / 2, R_IN + 13);
      s += `<text class="w-hnum" x="${f(hx)}" y="${f(hy)}">${i + 1}</text>`;
    });
  }

  const lonA = Object.fromEntries(inner.planets.map((p) => [p.key, p.lon]));
  if (inner.houses) { lonA.asc = inner.houses.asc; lonA.mc = inner.houses.mc; }
  const lonB = Object.fromEntries(outer.map((p) => [p.key, p.lon]));
  if (opts.outerAsc != null) lonB.asc = opts.outerAsc;

  for (const a of aspects) {
    if (a.type === 'conjunction' || (skipOuterPairs && OUTER.has(a.a) && OUTER.has(a.b))) continue;
    if (lonA[a.a] == null || lonB[a.b] == null) continue;
    const [x1, y1] = pt(lonA[a.a], R_ASP), [x2, y2] = pt(lonB[a.b], R_ASP);
    s += `<line class="w-asp ${ASPECTS_INFO[a.type].nature}" data-a="A${a.a}" data-b="B${a.b}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" style="--o:${Math.max(0.3, 1 - a.orb / ((a.max || 6) + 2)).toFixed(2)}"/>`;
  }

  for (const p of spread(inner.planets.filter((x) => x.key !== 'node'), 9)) {
    const pl = inner.planets.find((x) => x.key === p.key);
    const [x0, y0] = pt(p.lon, R_B), [x1, y1] = pt(p.lon, R_B - 7);
    const [gx, gy] = pt(p.disp, R_AG), [dx, dy] = pt(p.disp, R_ADEG), [ax, ay] = pt(p.lon, R_ASP);
    s += `<g class="w-planet who-a" data-key="A${p.key}" tabindex="0" role="button" aria-label="${esc(PLANETS[p.key].name)} (${esc(labelA)}): ${esc(SIGNS_INFO[pl.sign].name)} ${formatDeg(pl.lon)}">
      <line class="w-ptick" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>
      <circle class="w-hit" cx="${f(gx)}" cy="${f(gy)}" r="14"/>
      <text class="w-pglyph" x="${f(gx)}" y="${f(gy)}">${gl(PLANETS[p.key].glyph)}</text>
      <text class="w-pdeg" x="${f(dx)}" y="${f(dy)}">${Math.floor(pl.deg)}°${pl.retro ? 'R' : ''}</text>
      <circle class="w-adot" cx="${f(ax)}" cy="${f(ay)}" r="2.4"/></g>`;
  }
  for (const p of spread(outer.filter((x) => x.key !== 'node'), 8.5)) {
    const pl = outer.find((x) => x.key === p.key);
    const [x0, y0] = pt(p.lon, R_ZOD), [x1, y1] = pt(p.lon, R_ZOD - 6);
    const [gx, gy] = pt(p.disp, R_BG), [ax, ay] = pt(p.lon, R_ASP);
    s += `<g class="w-planet who-b" data-key="B${p.key}" tabindex="0" role="button" aria-label="${esc(PLANETS[p.key].name)} (${esc(labelB)}): ${esc(SIGNS_INFO[pl.sign].name)} ${formatDeg(pl.lon)}${pl.retro ? ', ретроградный' : ''}">
      <line class="w-ptick" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>
      <circle class="w-hit" cx="${f(gx)}" cy="${f(gy)}" r="13"/>
      <text class="w-pglyph" x="${f(gx)}" y="${f(gy)}">${gl(PLANETS[p.key].glyph)}</text>
      <circle class="w-adot" cx="${f(ax)}" cy="${f(ay)}" r="2.4"/></g>`;
  }

  svg.classList.remove('play');
  svg.innerHTML = s;
  svg.querySelectorAll('.w-planet').forEach((g) => {
    const pick = () => {
      svg.querySelectorAll('.w-planet').forEach((x) => x.classList.toggle('sel', x === g));
      svg.querySelectorAll('.w-asp').forEach((l) => l.classList.toggle('hl', l.dataset.a === g.dataset.key || l.dataset.b === g.dataset.key));
      onPick(g.dataset.key);
    };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  if (play) play(svg);
}
