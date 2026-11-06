// Интерфейс натальной карты: форма, поиск города, круг, трактовки.
import { loadAstronomy, calcNatal, formatOffset, formatDeg, isValidZone, SIGNS, angDist } from './natal.js?v=3';
import { PLANETS, SIGNS_INFO, HOUSES_INFO, ASPECTS_INFO, ELEMENTS_INFO, MODALITIES_INFO, SUN_IN, MOON_IN, ASC_IN } from './natal-texts.js?v=3';
import { parseDate, formatDate } from './matrix.js?v=3';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TEXT = '︎'; // просим браузер рисовать символ как текст, а не эмодзи
const gl = (s) => s + TEXT;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

let ctx = null;          // помощники из app.js
let place = null;        // { name, label, lat, lon, zone }
export let natalCurrent = null;

// ── Время ──────────────────────────────────────────
function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const hour = Number(m[1]), minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}
const fmtTime = ({ hour, minute }) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

function fieldError(input, msg) {
  const el = input.closest('.field').querySelector('.error');
  if (!msg) { el.hidden = true; input.removeAttribute('aria-invalid'); return; }
  el.textContent = msg; el.hidden = false; input.setAttribute('aria-invalid', 'true');
}

// ── Поиск города (Open-Meteo) ──────────────────────
let searchTimer = null, searchAbort = null, results = [], activeIdx = -1;

async function searchPlaces(q) {
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ru&format=json`;
  const res = await fetch(url, { signal: searchAbort.signal });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return (data.results || []).filter((r) => r.timezone).map((r) => ({
    name: r.name,
    label: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : '', r.country].filter(Boolean).join(', '),
    lat: r.latitude, lon: r.longitude, zone: r.timezone,
  }));
}

function renderPlaceList() {
  const list = $('placeList');
  const input = $('nPlace');
  if (!results.length) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
  list.innerHTML = results.map((r, i) => `<li role="option" id="pl${i}" class="${i === activeIdx ? 'active' : ''}" aria-selected="${i === activeIdx}" data-i="${i}">
    <b>${esc(r.name)}</b><span>${esc(r.label.split(', ').slice(1).join(', '))}</span></li>`).join('');
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  if (activeIdx >= 0) input.setAttribute('aria-activedescendant', 'pl' + activeIdx);
  else input.removeAttribute('aria-activedescendant');
}

function pickPlace(p) {
  place = p;
  $('nPlace').value = p.name;
  results = []; activeIdx = -1; renderPlaceList();
  showPicked();
  fieldError($('nPlace'), '');
}

function showPicked() {
  const el = $('placePicked');
  if (!place) { el.hidden = true; return; }
  el.innerHTML = `${esc(place.label)} · ${place.lat.toFixed(2)}°, ${place.lon.toFixed(2)}° · ${esc(place.zone)}`;
  el.hidden = false;
}

function setupPlaceSearch() {
  const input = $('nPlace');
  input.addEventListener('input', () => {
    place = null; showPicked();
    const q = input.value.trim();
    clearTimeout(searchTimer);
    if (q.length < 2) { results = []; renderPlaceList(); return; }
    searchTimer = setTimeout(async () => {
      try {
        results = await searchPlaces(q);
        activeIdx = results.length ? 0 : -1;
        renderPlaceList();
        if (!results.length) fieldError(input, 'Ничего не нашлось. Попробуй иначе или введи координаты вручную.');
        else fieldError(input, '');
      } catch (err) {
        if (err.name === 'AbortError') return;
        fieldError(input, 'Поиск городов сейчас недоступен — введи координаты вручную.');
        openManual(true);
      }
    }, 350);
  });
  input.addEventListener('keydown', (e) => {
    if ($('placeList').hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = (activeIdx + 1) % results.length; renderPlaceList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = (activeIdx - 1 + results.length) % results.length; renderPlaceList(); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pickPlace(results[activeIdx]); }
    else if (e.key === 'Escape') { results = []; renderPlaceList(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { results = []; renderPlaceList(); }, 150));
  $('placeList').addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (li) { e.preventDefault(); pickPlace(results[Number(li.dataset.i)]); }
  });
}

function openManual(force) {
  const box = $('manualBox');
  const open = force === true ? true : box.hidden;
  box.hidden = !open;
  $('manualToggle').textContent = open ? 'Скрыть ручной ввод' : 'Ввести координаты вручную';
  if (open && !$('zoneList').children.length) {
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch { /* старый браузер */ }
    const fixed = [];
    for (let h = -12; h <= 14; h++) fixed.push(`UTC${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`);
    $('zoneList').innerHTML = [...zones, ...fixed].map((z) => `<option value="${z}">`).join('');
  }
}

function readManual() {
  const num = (v) => Number(String(v).replace(',', '.').replace('−', '-').trim());
  const lat = num($('nLat').value), lon = num($('nLon').value), zone = $('nZone').value.trim();
  if (!isFinite(lat) || !isFinite(lon) || $('nLat').value.trim() === '' || $('nLon').value.trim() === '') return { error: 'Укажи широту и долготу числами' };
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { error: 'Широта от −90 до 90, долгота от −180 до 180' };
  if (!zone || !isValidZone(zone)) return { error: 'Укажи часовой пояс, например Asia/Novosibirsk или UTC+07:00' };
  return { name: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, label: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, lat, lon, zone };
}

// ── Круг карты ─────────────────────────────────────
const CX = 300, CY = 300;
const R_OUT = 292, R_ZOD = 250, R_HOUSE = 214, R_PLAN = 186, R_ASP = 128, R_IN = 64;

function drawWheel(c) {
  const asc = c.houses ? c.houses.asc : 0;
  const ang = (lon) => (180 + (lon - asc)) * Math.PI / 180;
  const pt = (lon, r) => [CX + r * Math.cos(ang(lon)), CY - r * Math.sin(ang(lon))];
  const f = (n) => n.toFixed(2);
  let s = '';

  // Кольца
  s += `<circle class="w-ring" cx="${CX}" cy="${CY}" r="${R_OUT}"/><circle class="w-ring" cx="${CX}" cy="${CY}" r="${R_ZOD}"/>`;
  s += `<circle class="w-ring soft" cx="${CX}" cy="${CY}" r="${R_HOUSE}"/><circle class="w-ring soft" cx="${CX}" cy="${CY}" r="${R_ASP}"/><circle class="w-ring soft" cx="${CX}" cy="${CY}" r="${R_IN}"/>`;

  // Знаки зодиака
  for (let i = 0; i < 12; i++) {
    const a0 = i * 30, a1 = a0 + 30;
    const [x1, y1] = pt(a0, R_ZOD), [x2, y2] = pt(a0, R_OUT);
    s += `<line class="w-line" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
    const [tx, ty] = pt(a0 + 15, (R_ZOD + R_OUT) / 2);
    s += `<text class="w-sign el-${SIGNS_INFO[i].element}" x="${f(tx)}" y="${f(ty)}">${gl(SIGNS_INFO[i].glyph)}</text>`;
    for (let d = 5; d < 30; d += 5) {
      const [a, b] = pt(a0 + d, R_ZOD), [c2, d2] = pt(a0 + d, R_ZOD - (d % 10 ? 4 : 7));
      s += `<line class="w-tick" x1="${f(a)}" y1="${f(b)}" x2="${f(c2)}" y2="${f(d2)}"/>`;
    }
    void a1;
  }

  // Дома
  if (c.houses) {
    c.houses.cusps.forEach((lon, i) => {
      const axis = i === 0 || i === 3 || i === 6 || i === 9;
      const [x1, y1] = pt(lon, R_IN), [x2, y2] = pt(lon, axis ? R_ZOD : R_HOUSE);
      s += `<line class="w-house${axis ? ' axis' : ''}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
      const next = c.houses.cusps[(i + 1) % 12];
      const mid = lon + ((next - lon + 360) % 360) / 2;
      const [hx, hy] = pt(mid, R_IN + 14);
      s += `<text class="w-hnum" x="${f(hx)}" y="${f(hy)}">${i + 1}</text>`;
    });
    for (const [lon, label] of [[c.houses.asc, 'ASC'], [c.houses.mc, 'MC']]) {
      const [lx, ly] = pt(lon, R_OUT + 0);
      const [ox, oy] = pt(lon, R_OUT - 2);
      s += `<circle class="w-axis-dot" cx="${f(ox)}" cy="${f(oy)}" r="3"/>`;
      void lx; void ly;
      const [tx, ty] = pt(lon + 6, R_HOUSE + 18);
      s += `<text class="w-axis" x="${f(tx)}" y="${f(ty)}">${label}</text>`;
    }
  }

  // Аспекты
  for (const a of c.aspects) {
    if (a.type === 'conjunction') continue;
    const pa = c.planets.find((p) => p.key === a.a), pb = c.planets.find((p) => p.key === a.b);
    const [x1, y1] = pt(pa.lon, R_ASP), [x2, y2] = pt(pb.lon, R_ASP);
    s += `<line class="w-asp ${ASPECTS_INFO[a.type].nature}" data-a="${a.a}" data-b="${a.b}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" style="--o:${Math.max(0.35, 1 - a.orb / 9).toFixed(2)}"/>`;
  }

  // Планеты: раздвигаем, чтобы символы не налезали
  const sorted = [...c.planets].sort((a, b) => a.lon - b.lon);
  const pos = sorted.map((p) => ({ key: p.key, lon: p.lon, disp: p.lon }));
  const MIN = 9;
  for (let iter = 0; iter < 30; iter++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      const a = pos[i], b = pos[(i + 1) % pos.length];
      let gap = (b.disp - a.disp + 360) % 360;
      if (pos.length > 1 && gap < MIN) {
        const push = (MIN - gap) / 2;
        a.disp -= push; b.disp += push; moved = true;
      }
    }
    if (!moved) break;
  }
  for (const p of pos) {
    const planet = c.planets.find((x) => x.key === p.key);
    const [x0, y0] = pt(p.lon, R_HOUSE), [x1, y1] = pt(p.lon, R_HOUSE - 8);
    const [gx, gy] = pt(p.disp, R_PLAN);
    const [dx, dy] = pt(p.disp, R_PLAN - 24);
    const [ax, ay] = pt(p.lon, R_ASP);
    s += `<g class="w-planet" data-key="${p.key}" tabindex="0" role="button" aria-label="${esc(PLANETS[p.key].name)}: ${esc(SIGNS_INFO[planet.sign].name)} ${formatDeg(planet.lon)}">
      <line class="w-ptick" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>
      <circle class="w-hit" cx="${f(gx)}" cy="${f(gy)}" r="15"/>
      <text class="w-pglyph" x="${f(gx)}" y="${f(gy)}">${gl(PLANETS[p.key].glyph)}</text>
      <text class="w-pdeg" x="${f(dx)}" y="${f(dy)}">${Math.floor(planet.deg)}°${planet.retro ? 'R' : ''}</text>
      <circle class="w-adot" cx="${f(ax)}" cy="${f(ay)}" r="2.6"/>
    </g>`;
  }

  const svg = $('wheel');
  svg.classList.remove('play');
  svg.innerHTML = s;
  svg.querySelectorAll('.w-planet').forEach((g) => {
    const pick = () => selectPlanet(g.dataset.key);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  ctx.playWhenVisible(svg);
}

function selectPlanet(key) {
  const c = natalCurrent.chart;
  const p = c.planets.find((x) => x.key === key);
  const P = PLANETS[key], S = SIGNS_INFO[p.sign];
  $('wheel').querySelectorAll('.w-planet').forEach((g) => g.classList.toggle('sel', g.dataset.key === key));
  $('wheel').querySelectorAll('.w-asp').forEach((l) => l.classList.toggle('hl', l.dataset.a === key || l.dataset.b === key));
  const house = p.house ? ` · ${HOUSES_INFO[p.house - 1].title}` : '';
  $('wheelInfo').innerHTML = `<strong><span class="glyph">${gl(P.glyph)}</span> ${P.name} в ${S.gen} ${formatDeg(p.lon)}${p.retro ? ' · ретроградный' : ''}${house}</strong>${esc(P.about)}`;
}

// ── Текстовые блоки ────────────────────────────────
function signLine(lon) {
  const s = SIGNS_INFO[Math.floor(lon / 30)];
  return `<span class="glyph">${gl(s.glyph)}</span> ${s.name} ${formatDeg(lon)}`;
}

function renderBigThree(c) {
  const sun = c.planets.find((p) => p.key === 'sun'), moon = c.planets.find((p) => p.key === 'moon');
  const card = (label, hint, title, text) => `<article class="card">
    <span class="card-label">${label}</span><p class="card-hint">${hint}</p>
    <h3 class="card-title">${title}</h3><p class="card-text">${text}</p></article>`;
  const g = ctx.g;
  let html = card('Солнце', 'Твоя суть и то, что даёт силы', `<span class="glyph">${gl('☉')}</span> в ${SIGNS_INFO[sun.sign].gen}`, g(SUN_IN[sun.sign]));
  html += card('Луна', 'Чувства и внутренний мир', `<span class="glyph">${gl('☽')}</span> в ${SIGNS_INFO[moon.sign].gen}`, g(MOON_IN[moon.sign]));
  if (c.houses) {
    const s = Math.floor(c.houses.asc / 30);
    html += card('Асцендент', 'Как тебя видят при первой встрече', `ASC в ${SIGNS_INFO[s].gen}`, g(ASC_IN[s]));
  } else {
    html += card('Асцендент', 'Как тебя видят при первой встрече', '—', 'Для асцендента нужно точное время рождения. Если узнаешь его, построй карту заново.');
  }
  $('bigThree').innerHTML = html;
}

function renderTable(c) {
  $('houseCol').hidden = !c.houses;
  const rows = c.planets.map((p) => {
    const P = PLANETS[p.key], S = SIGNS_INFO[p.sign];
    return `<tr data-key="${p.key}" tabindex="0">
      <td><span class="glyph">${gl(P.glyph)}</span> ${P.name}${p.retro ? ' <span class="retro" title="ретроградный">R</span>' : ''}</td>
      <td><span class="glyph">${gl(S.glyph)}</span> ${S.name}</td>
      <td>${formatDeg(p.lon)}</td>
      ${c.houses ? `<td>${ROMAN[p.house - 1]}</td>` : ''}
    </tr>`;
  });
  if (c.houses) {
    rows.push(`<tr class="axis-row"><td>Асцендент</td><td>${signLine(c.houses.asc).replace(/ \d+°.*$/, '')}</td><td>${formatDeg(c.houses.asc)}</td><td>I</td></tr>`);
    rows.push(`<tr class="axis-row"><td>MC</td><td>${signLine(c.houses.mc).replace(/ \d+°.*$/, '')}</td><td>${formatDeg(c.houses.mc)}</td><td>X</td></tr>`);
  }
  $('planetBody').innerHTML = rows.join('');
  $('planetBody').querySelectorAll('tr[data-key]').forEach((tr) => {
    const pick = () => { selectPlanet(tr.dataset.key); $('wheelInfo').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    tr.addEventListener('click', pick);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
  });
}

function renderBalance(c) {
  const total = c.elements.reduce((s, x) => s + x, 0) || 1;
  const els = ['fire', 'earth', 'air', 'water'];
  const maxE = Math.max(...c.elements);
  const bar = (name, about, val, max, cls) => `<div class="bal-row ${cls}${val === max ? ' top' : ''}">
    <span class="bal-name">${name}</span>
    <span class="bal-bar"><span style="--w:${(val / total * 100).toFixed(0)}%"></span></span>
    <span class="bal-val">${Math.round(val / total * 100)}%</span>
    <span class="bal-about">${about}</span></div>`;
  let html = '<div class="bal-group">' + els.map((e, i) => bar(ELEMENTS_INFO[e].name, ELEMENTS_INFO[e].about, c.elements[i], maxE, 'el-' + e)).join('') + '</div>';
  const mods = ['cardinal', 'fixed', 'mutable'];
  const maxM = Math.max(...c.modalities);
  html += '<div class="bal-group">' + mods.map((m, i) => bar(MODALITIES_INFO[m].name, MODALITIES_INFO[m].about, c.modalities[i], maxM, 'mod')).join('') + '</div>';
  const lead = els[c.elements.indexOf(maxE)];
  const lowIdx = c.elements.indexOf(Math.min(...c.elements));
  html += `<p class="card-text bal-sum">Больше всего в карте стихии <b>${ELEMENTS_INFO[lead].name.toLowerCase()}</b>: ${ELEMENTS_INFO[lead].about}. Меньше всего — ${ELEMENTS_INFO[els[lowIdx]].name.toLowerCase()}: эти качества приходится развивать сознательно.</p>`;
  $('balance').innerHTML = html;
}

function renderPlanetCards(c) {
  const html = c.planets.filter((p) => p.key !== 'sun' && p.key !== 'moon').map((p) => {
    const P = PLANETS[p.key], S = SIGNS_INFO[p.sign];
    const verb = p.key === 'node' ? 'зовёт развиваться' : 'проявляются';
    let text = p.key === 'node'
      ? `${P.subject}: душа растёт, когда действует ${S.manner}.`
      : `${P.subject} ${verb} ${S.manner}.`;
    if (p.house) {
      const H = HOUSES_INFO[p.house - 1];
      text += ` Главная сцена — ${H.title}: ${H.sphere} (${H.about}).`;
    }
    if (p.retro) text += ' Планета ретроградна: её энергия обращена внутрь и раскрывается не сразу, через переосмысление.';
    return `<article class="card">
      <span class="card-label">${P.name}</span>
      <p class="card-hint">${esc(P.about)}</p>
      <h3 class="card-title"><span class="glyph">${gl(P.glyph)}</span> в ${S.gen}${p.house ? ` · ${ROMAN[p.house - 1]}` : ''}</h3>
      <p class="card-text">${text}</p>
    </article>`;
  }).join('');
  $('planetCards').innerHTML = html;
}

function renderAspects(c) {
  const list = c.aspects.slice(0, 18);
  $('aspectList').innerHTML = list.length ? list.map((a) => {
    const A1 = PLANETS[a.a], B1 = PLANETS[a.b], X = ASPECTS_INFO[a.type];
    return `<li class="asp ${X.nature}">
      <span class="asp-glyphs"><span class="glyph">${gl(A1.glyph)}</span><span class="glyph asp-sym">${gl(X.glyph)}</span><span class="glyph">${gl(B1.glyph)}</span></span>
      <span class="asp-body"><b>${A1.name} — ${X.name.toLowerCase()} — ${B1.name}</b> <small>орб ${a.orb.toFixed(1)}°</small>
      <span>«${A1.theme}» и «${B1.theme}»: ${X.text}.</span></span>
    </li>`;
  }).join('') : '<li class="muted">Точных мажорных аспектов не найдено.</li>';
}

// ── Показ ──────────────────────────────────────────
export async function showNatal(data, { scroll = true } = {}) {
  await loadAstronomy();
  const chart = calcNatal({ ...data.date, ...(data.time || {}), timeKnown: !!data.time, lat: data.place.lat, lon: data.place.lon, zone: data.place.zone });
  natalCurrent = { ...data, chart };

  $('nTitle').textContent = data.name ? `КАРТА: ${data.name.toUpperCase()}` : 'НАТАЛЬНАЯ КАРТА';
  const timeStr = data.time ? `, ${fmtTime(data.time)}` : ', время неизвестно';
  $('nSub').textContent = `${formatDate(data.date)}${timeStr} · ${data.place.name} · ${formatOffset(chart.offset)}`;
  $('nNoTimeNote').hidden = !!data.time;

  drawWheel(chart);
  $('wheelInfo').innerHTML = 'Нажми на планету в круге, чтобы узнать о ней';
  renderBigThree(chart);
  renderTable(chart);
  renderBalance(chart);
  renderPlanetCards(chart);
  renderAspects(chart);
  $('natalResult').hidden = false;
  ctx.revealAll($('natalResult'));

  const params = { nd: formatDate(data.date), lat: data.place.lat.toFixed(4), lon: data.place.lon.toFixed(4), tz: data.place.zone, pl: data.place.name };
  if (data.time) params.nt = fmtTime(data.time);
  if (data.name) params.n = data.name;
  ctx.setHash(params);
  if (scroll) $('natalResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function natalRecord() {
  const d = natalCurrent;
  return { t: 'natal', d: formatDate(d.date), tm: d.time ? fmtTime(d.time) : '', n: d.name, p: d.place };
}

/** Заполнить форму и показать карту (из ссылки или «Моих матриц»). */
export async function openNatal({ name = '', d, tm, p }) {
  const date = parseDate(d);
  if (!date || !p || !isFinite(p.lat) || !isFinite(p.lon) || !isValidZone(p.zone)) return false;
  const time = tm ? parseTime(tm) : null;
  $('nName').value = name;
  $('nDate').value = formatDate(date);
  $('nTime').value = time ? fmtTime(time) : '';
  $('nNoTime').checked = !time;
  $('nTime').disabled = !time;
  place = { name: p.name || `${(+p.lat).toFixed(2)}°, ${(+p.lon).toFixed(2)}°`, label: p.label || p.name || '', lat: +p.lat, lon: +p.lon, zone: p.zone };
  $('nPlace').value = place.name;
  showPicked();
  try {
    await showNatal({ name, date, time, place });
  } catch (err) {
    ctx.toast('Не удалось построить карту: ' + err.message);
    return false;
  }
  return true;
}

export function natalFromHash(params) {
  if (!params.get('nd')) return null;
  return {
    name: (params.get('n') || '').slice(0, 40),
    d: params.get('nd'), tm: params.get('nt') || '',
    p: { name: (params.get('pl') || '').slice(0, 80), lat: Number(params.get('lat')), lon: Number(params.get('lon')), zone: params.get('tz') || '' },
  };
}

export function initNatal(helpers) {
  ctx = helpers;
  setupPlaceSearch();
  $('manualToggle').addEventListener('click', () => openManual());

  const time = $('nTime');
  time.addEventListener('input', () => {
    const digits = time.value.replace(/\D/g, '').slice(0, 4);
    time.value = digits.length > 2 ? digits.slice(0, 2) + ':' + digits.slice(2) : digits;
    fieldError(time, '');
  });
  $('nNoTime').addEventListener('change', () => {
    time.disabled = $('nNoTime').checked;
    if (time.disabled) fieldError(time, '');
  });

  $('natalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dateInput = $('nDate');
    const date = parseDate(dateInput.value);
    if (!date) { fieldError(dateInput, dateInput.value ? 'Проверь дату: формат ДД.ММ.ГГГГ' : 'Введи дату рождения'); dateInput.focus(); return; }
    fieldError(dateInput, '');

    let t = null;
    if (!$('nNoTime').checked) {
      t = parseTime(time.value);
      if (!t) { fieldError(time, time.value ? 'Проверь время: формат ЧЧ:ММ, например 14:30' : 'Введи время или отметь «Не знаю точное время»'); time.focus(); return; }
    }

    let p = place;
    if (!$('manualBox').hidden && (!p || $('nLat').value.trim())) {
      const m = readManual();
      if (m.error) { fieldError($('nPlace'), m.error); return; }
      p = m;
    }
    if (!p) { fieldError($('nPlace'), 'Выбери город из списка или введи координаты вручную'); $('nPlace').focus(); return; }
    fieldError($('nPlace'), '');

    const btn = $('natalForm').querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'СЧИТАЮ…';
    try {
      await showNatal({ name: $('nName').value.trim(), date, time: t, place: p });
    } catch (err) {
      ctx.toast('Не удалось построить карту: ' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'ПОСТРОИТЬ КАРТУ';
    }
  });

  $('nSaveBtn').addEventListener('click', () => ctx.saveRecord(natalRecord()));
  $('nShareBtn').addEventListener('click', () => {
    const sun = natalCurrent.chart.planets[0];
    ctx.shareLink(`Солнце в ${SIGNS_INFO[sun.sign].gen}. Построй свою натальную карту в «Аркане»`);
  });
}

export const natalSignName = (lon) => SIGNS_INFO[Math.floor(lon / 30)].name;
export { SIGNS, angDist };
