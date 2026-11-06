// Синастрия: форма на двоих, двойной круг, шкалы, ключевые связи, наложение домов.
import { loadAstronomy, calcNatal, calcSynastry, formatDeg, formatOffset, isValidZone } from './natal.js?v=6';
import { PLANETS, SIGNS_INFO, HOUSES_INFO, ASPECTS_INFO } from './natal-texts.js?v=6';
import { SYN_TOPICS, SYN_NATURE, SYN_CATS_INFO, HOUSE_OVERLAY, totalText } from './syn-texts.js?v=6';
import { personFieldsHTML, attachPerson, parseTime, fmtTime } from './place-field.js?v=6';
import { parseDate, formatDate } from './matrix.js?v=6';
import { natalCurrent } from './natal-ui.js?v=6';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gl = (s) => s + '︎';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const OUTER = new Set(['uranus', 'neptune', 'pluto']);
const IMPORTANCE = { sun: 5, moon: 5, venus: 4, mars: 4, asc: 4, mercury: 3, saturn: 3, jupiter: 2, uranus: 1, neptune: 1, pluto: 1 };
const POINT = (key) => (key === 'asc' ? { name: 'Асцендент', glyph: 'AC', ascii: true } : PLANETS[key]);
const glyphOf = (key) => (key === 'asc' ? 'AC' : gl(PLANETS[key].glyph));

let ctx = null, pa = null, pb = null;
let sub = 'one';
export let synCurrent = null;

// ── Переключатель «одна карта / синастрия» ─────────
export function natalSub() { return sub; }
export function applyNatalSub() {
  document.querySelectorAll('#natalSub .subtab').forEach((b) => {
    const on = b.dataset.sub === sub;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  });
  $('natalForm').hidden = sub !== 'one';
  $('synForm').hidden = sub !== 'syn';
  $('natalResult').hidden = !(sub === 'one' && natalCurrent);
  $('synResult').hidden = !(sub === 'syn' && synCurrent);
}
export function setSub(next) {
  sub = next;
  applyNatalSub();
  ctx.refreshPlaceholder();
}

// ── Двойной круг ───────────────────────────────────
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

function drawBiWheel() {
  const { ca, cb, syn } = synCurrent;
  const asc = ca.houses ? ca.houses.asc : 0;
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
  if (ca.houses) {
    ca.houses.cusps.forEach((lon, i) => {
      const axis = i % 3 === 0;
      const [x1, y1] = pt(lon, R_IN), [x2, y2] = pt(lon, axis ? R_ZOD : R_B);
      s += `<line class="w-house${axis ? ' axis' : ''}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
      const next = ca.houses.cusps[(i + 1) % 12];
      const [hx, hy] = pt(lon + ((next - lon + 360) % 360) / 2, R_IN + 13);
      s += `<text class="w-hnum" x="${f(hx)}" y="${f(hy)}">${i + 1}</text>`;
    });
  }

  const lonA = Object.fromEntries(ca.planets.map((p) => [p.key, p.lon]));
  const lonB = Object.fromEntries(cb.planets.map((p) => [p.key, p.lon]));
  if (ca.houses) lonA.asc = ca.houses.asc;
  if (cb.houses) lonB.asc = cb.houses.asc;

  for (const a of syn.aspects) {
    if (a.type === 'conjunction' || (OUTER.has(a.a) && OUTER.has(a.b))) continue;
    const [x1, y1] = pt(lonA[a.a], R_ASP), [x2, y2] = pt(lonB[a.b], R_ASP);
    s += `<line class="w-asp ${ASPECTS_INFO[a.type].nature}" data-a="A${a.a}" data-b="B${a.b}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" style="--o:${Math.max(0.3, 1 - a.orb / (a.max + 2)).toFixed(2)}"/>`;
  }

  const planetsOf = (c) => c.planets.filter((p) => p.key !== 'node');
  // Внутреннее кольцо — первый человек
  for (const p of spread(planetsOf(ca), 9)) {
    const pl = ca.planets.find((x) => x.key === p.key);
    const [x0, y0] = pt(p.lon, R_B), [x1, y1] = pt(p.lon, R_B - 7);
    const [gx, gy] = pt(p.disp, R_AG), [dx, dy] = pt(p.disp, R_ADEG), [ax, ay] = pt(p.lon, R_ASP);
    s += `<g class="w-planet who-a" data-key="A${p.key}" tabindex="0" role="button" aria-label="${esc(PLANETS[p.key].name)} (${esc(synCurrent.na)}): ${esc(SIGNS_INFO[pl.sign].name)} ${formatDeg(pl.lon)}">
      <line class="w-ptick" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>
      <circle class="w-hit" cx="${f(gx)}" cy="${f(gy)}" r="14"/>
      <text class="w-pglyph" x="${f(gx)}" y="${f(gy)}">${gl(PLANETS[p.key].glyph)}</text>
      <text class="w-pdeg" x="${f(dx)}" y="${f(dy)}">${Math.floor(pl.deg)}°</text>
      <circle class="w-adot" cx="${f(ax)}" cy="${f(ay)}" r="2.4"/></g>`;
  }
  // Внешнее кольцо — второй человек
  for (const p of spread(planetsOf(cb), 8.5)) {
    const pl = cb.planets.find((x) => x.key === p.key);
    const [x0, y0] = pt(p.lon, R_ZOD), [x1, y1] = pt(p.lon, R_ZOD - 6);
    const [gx, gy] = pt(p.disp, R_BG), [ax, ay] = pt(p.lon, R_ASP);
    s += `<g class="w-planet who-b" data-key="B${p.key}" tabindex="0" role="button" aria-label="${esc(PLANETS[p.key].name)} (${esc(synCurrent.nb)}): ${esc(SIGNS_INFO[pl.sign].name)} ${formatDeg(pl.lon)}">
      <line class="w-ptick" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>
      <circle class="w-hit" cx="${f(gx)}" cy="${f(gy)}" r="13"/>
      <text class="w-pglyph" x="${f(gx)}" y="${f(gy)}">${gl(PLANETS[p.key].glyph)}</text>
      <circle class="w-adot" cx="${f(ax)}" cy="${f(ay)}" r="2.4"/></g>`;
  }
  const svg = $('biwheel');
  svg.classList.remove('play');
  svg.innerHTML = s;
  svg.querySelectorAll('.w-planet').forEach((g) => {
    const pick = () => selectPoint(g.dataset.key);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  ctx.playWhenVisible(svg);
}

function selectPoint(id) {
  const who = id[0], key = id.slice(1);
  const { ca, cb, syn, na, nb } = synCurrent;
  const own = who === 'A' ? ca : cb, other = who === 'A' ? cb : ca;
  const p = own.planets.find((x) => x.key === key);
  $('biwheel').querySelectorAll('.w-planet').forEach((g) => g.classList.toggle('sel', g.dataset.key === id));
  $('biwheel').querySelectorAll('.w-asp').forEach((l) => l.classList.toggle('hl', l.dataset.a === id || l.dataset.b === id));
  const links = syn.aspects.filter((a) => (who === 'A' ? a.a === key : a.b === key)).slice(0, 6).map((a) => {
    const otherKey = who === 'A' ? a.b : a.a;
    return `${gl(ASPECTS_INFO[a.type].glyph)} ${POINT(otherKey).name}`;
  });
  const ownName = who === 'A' ? na : nb, otherName = who === 'A' ? nb : na;
  const house = other.houses ? ` · ${ROMAN[houseIdx(p.lon, other.houses.cusps)]} дом (${esc(otherName)})` : '';
  $('sInfo').innerHTML = `<strong><span class="glyph">${gl(PLANETS[key].glyph)}</span> ${PLANETS[key].name} (${esc(ownName)}) в ${SIGNS_INFO[p.sign].gen} ${formatDeg(p.lon)}${house}</strong>`
    + (links.length ? `Связи с картой: ${esc(otherName)} — <span class="glyph">${links.join(', ')}</span>` : 'Точных связей с картой партнёра нет.');
}

function houseIdx(lon, cusps) {
  for (let i = 0; i < 12; i++) {
    const a = cusps[i], b = cusps[(i + 1) % 12];
    if (((lon - a + 360) % 360) < ((b - a + 360) % 360)) return i;
  }
  return 0;
}

// ── Текстовые блоки ────────────────────────────────
function topicFor(a, b) {
  return SYN_TOPICS[`${a}-${b}`] || SYN_TOPICS[`${b}-${a}`] || null;
}

function renderScores() {
  const { syn } = synCurrent;
  $('sTotal').innerHTML = `<span class="score-num">${syn.total}%</span><span class="score-text">${totalText(syn.total)}</span>`;
  $('sScores').innerHTML = '<div class="bal-group">' + Object.entries(syn.scores).map(([k, v]) => `
    <div class="bal-row score">
      <span class="bal-name">${SYN_CATS_INFO[k].name}</span>
      <span class="bal-bar"><span style="--w:${v.value}%"></span></span>
      <span class="bal-val">${v.value}%</span>
      <span class="bal-about">${SYN_CATS_INFO[k].about}${v.count ? '' : ' · прямых связей нет'}</span>
    </div>`).join('') + '</div>';
}

function renderKey() {
  const { syn, na, nb } = synCurrent;
  const ranked = syn.aspects
    .filter((a) => !(OUTER.has(a.a) && OUTER.has(a.b)) && (IMPORTANCE[a.a] >= 3 || IMPORTANCE[a.b] >= 3))
    .map((a) => ({ ...a, w: (IMPORTANCE[a.a] + IMPORTANCE[a.b]) * (1 - a.orb / (a.max + 1)) }))
    .sort((x, y) => y.w - x.w)
    .slice(0, 6);
  $('sKey').innerHTML = ranked.length ? ranked.map((a) => {
    const X = ASPECTS_INFO[a.type];
    const topic = topicFor(a.a, a.b) || `«${a.a === 'asc' ? 'первое впечатление' : PLANETS[a.a].theme}» и «${a.b === 'asc' ? 'первое впечатление' : PLANETS[a.b].theme}» встречаются между вами`;
    return `<article class="card syn-card ${X.nature}">
      <span class="card-label">${esc(POINT(a.a).name)} (${esc(na)}) · ${esc(POINT(a.b).name)} (${esc(nb)})</span>
      <h3 class="card-title"><span class="glyph">${glyphOf(a.a)}</span> <span class="glyph asp-sym">${gl(X.glyph)}</span> <span class="glyph">${glyphOf(a.b)}</span> ${X.name}</h3>
      <p class="card-hint">орб ${a.orb.toFixed(1)}°</p>
      <p class="card-text">${esc(topic)}. ${SYN_NATURE[a.type]}</p>
    </article>`;
  }).join('') : '<p class="muted center">Сильных связей между личными планетами не найдено — отношения строятся на чём-то другом.</p>';
}

function renderOverlay() {
  const { syn, na, nb } = synCurrent;
  const personal = new Set(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']);
  const col = (list, who, whose) => {
    if (!list) return `<div class="ov-col"><h3>${esc(who)} → ${esc(whose)}</h3><p class="muted small">Нужно время рождения: ${esc(whose)}</p></div>`;
    return `<div class="ov-col"><h3>Планеты: ${esc(who)} → дома: ${esc(whose)}</h3><ul>` + list.filter((x) => personal.has(x.key)).map((x) =>
      `<li><span class="glyph">${gl(PLANETS[x.key].glyph)}</span><span><b>${PLANETS[x.key].name} → ${ROMAN[x.house - 1]} дом</b> ${HOUSES_INFO[x.house - 1].sphere}: ${HOUSE_OVERLAY[x.house - 1]}.</span></li>`).join('') + '</ul></div>';
  };
  const any = syn.overlayAinB || syn.overlayBinA;
  $('sOverlayBlock').hidden = !any;
  if (any) $('sOverlay').innerHTML = col(syn.overlayAinB, na, nb) + col(syn.overlayBinA, nb, na);
}

function renderAll() {
  const { syn, na, nb } = synCurrent;
  const list = syn.aspects.filter((a) => !(OUTER.has(a.a) && OUTER.has(a.b))).slice(0, 30);
  $('sAspects').innerHTML = list.map((a) => {
    const X = ASPECTS_INFO[a.type];
    const topic = topicFor(a.a, a.b);
    return `<li class="asp ${X.nature}">
      <span class="asp-glyphs"><span class="glyph">${glyphOf(a.a)}</span><span class="glyph asp-sym">${gl(X.glyph)}</span><span class="glyph syn-b">${glyphOf(a.b)}</span></span>
      <span class="asp-body"><b>${esc(POINT(a.a).name)} (${esc(na)}) — ${X.name.toLowerCase()} — ${esc(POINT(a.b).name)} (${esc(nb)})</b> <small>орб ${a.orb.toFixed(1)}°</small>
      ${topic ? `<span>${esc(topic)}.</span>` : ''}</span></li>`;
  }).join('');
}

// ── Показ ──────────────────────────────────────────
const timeLabel = (d) => (d.time ? fmtTime(d.time) : 'время неизвестно');

export async function showSyn(a, b, { scroll = true } = {}) {
  await loadAstronomy();
  const calc = (d) => calcNatal({ ...d.date, ...(d.time || {}), timeKnown: !!d.time, lat: d.place.lat, lon: d.place.lon, zone: d.place.zone });
  const ca = calc(a), cb = calc(b);
  const na = a.name || 'Первый', nb = b.name || 'Второй';
  synCurrent = { a, b, ca, cb, na, nb, syn: calcSynastry(ca, cb) };

  $('sSub').textContent = `${na}: ${formatDate(a.date)}, ${timeLabel(a)}, ${a.place.name} · ${nb}: ${formatDate(b.date)}, ${timeLabel(b)}, ${b.place.name}`;
  const noTime = [!a.time && na, !b.time && nb].filter(Boolean);
  $('sNoTimeNote').hidden = !noTime.length;
  if (noTime.length) $('sNoTimeNote').textContent = `Нет времени рождения: ${noTime.join(', ')}. Без него не учитываются асцендент и дома — часть выводов будет приблизительной.`;
  $('sLegend').innerHTML = `<span class="lg lg-a"><i></i>${esc(na)} — внутренний круг</span><span class="lg lg-b"><i></i>${esc(nb)} — внешний круг</span>`;

  drawBiWheel();
  $('sInfo').innerHTML = 'Нажми на планету, чтобы увидеть её связи с картой партнёра';
  renderScores();
  renderKey();
  renderOverlay();
  renderAll();
  $('synResult').hidden = false;
  ctx.revealAll($('synResult'));

  ctx.setHash({ sa: packPerson(a), sb: packPerson(b) });
  if (scroll) $('synResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Человек в ссылке: дата|время|широта|долгота|пояс|место|имя
const clean = (s) => String(s || '').replace(/\|/g, ' ').slice(0, 80);
function packPerson(d) {
  return [formatDate(d.date), d.time ? fmtTime(d.time) : '', d.place.lat.toFixed(4), d.place.lon.toFixed(4), d.place.zone, clean(d.place.name), clean(d.name).slice(0, 40)].join('|');
}
function unpackPerson(str) {
  const [ds, ts, la, lo, tz, pl, nm] = String(str || '').split('|');
  const date = parseDate(ds);
  const lat = Number(la), lon = Number(lo);
  if (!date || !isFinite(lat) || !isFinite(lon) || !tz || !isValidZone(tz)) return null;
  return { date, time: ts ? parseTime(ts) : null, name: nm || '', place: { name: pl || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, label: pl || '', lat, lon, zone: tz } };
}

export function synFromHash(params) {
  if (!params.get('sa') || !params.get('sb')) return null;
  const a = unpackPerson(params.get('sa')), b = unpackPerson(params.get('sb'));
  return a && b ? { a, b } : null;
}

export async function openSyn({ a, b }) {
  pa.fill(a); pb.fill(b);
  sub = 'syn';
  applyNatalSub();
  ctx.refreshPlaceholder();
  try { await showSyn(a, b); } catch (err) { ctx.toast('Не удалось построить синастрию: ' + err.message); }
}

export function synRecord() {
  return { t: 'syn', a: packPerson(synCurrent.a), b: packPerson(synCurrent.b), n: `${synCurrent.na} + ${synCurrent.nb}` };
}
export function openSynRecord(rec) {
  const a = unpackPerson(rec.a), b = unpackPerson(rec.b);
  if (a && b) openSyn({ a, b });
}

export function initSyn(helpers) {
  ctx = helpers;
  $('saPerson').innerHTML = personFieldsHTML('sa', { namePlaceholder: 'Имя' });
  $('sbPerson').innerHTML = personFieldsHTML('sb', { namePlaceholder: 'Имя' });
  pa = attachPerson('sa', { parseDate, formatDate });
  pb = attachPerson('sb', { parseDate, formatDate });

  document.querySelectorAll('#natalSub .subtab').forEach((b) => b.addEventListener('click', () => setSub(b.dataset.sub)));

  $('synForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = pa.read();
    if (a.error) { a.focus.focus(); return; }
    const b = pb.read();
    if (b.error) { b.focus.focus(); return; }
    const btn = $('synForm').querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'СЧИТАЮ…';
    try { await showSyn(a, b); }
    catch (err) { ctx.toast('Не удалось построить синастрию: ' + err.message); }
    finally { btn.disabled = false; btn.textContent = 'СРАВНИТЬ КАРТЫ'; }
  });

  $('sSaveBtn').addEventListener('click', () => ctx.saveRecord(synRecord()));
  $('sShareBtn').addEventListener('click', () => ctx.shareLink(`Наша совместимость по синастрии — ${synCurrent.syn.total}%. Сравни свои карты в «Аркане»`));
}

export { formatOffset };
