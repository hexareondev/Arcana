// Транзиты: небо на выбранную дату поверх натальной карты.
import { calcTransits, upcomingTransits, formatDeg, houseOf, SLOW } from './natal.js?v=7';
import { PLANETS, SIGNS_INFO, ASPECTS_INFO } from './natal-texts.js?v=7';
import { TR_PLANET, TR_AREA, TR_TARGET_NAME, TR_VERB, MOON_DAY } from './transit-texts.js?v=7';
import { drawBiWheel } from './biwheel.js?v=7';
import { parseDate, formatDate } from './matrix.js?v=7';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gl = (s) => s + '︎';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const DAY = 86400000;
const TR_ORB = { sun: 1.5, mercury: 1.5, venus: 1.5, mars: 2, jupiter: 2, saturn: 2, uranus: 2, neptune: 2, pluto: 2 };
const nature = (type) => (type === 'conjunction' ? 'conj' : ASPECTS_INFO[type].nature === 'soft' ? 'soft' : 'tense');
const targetName = (k) => TR_TARGET_NAME[k] || PLANETS[k].name;
const targetGlyph = (k) => (k === 'asc' ? 'AC' : k === 'mc' ? 'MC' : gl(PLANETS[k].glyph));
const ruDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const ruDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

let ctx = null, chart = null, ms = null, tr = null;

// Полдень выбранной даты по времени браузера
const noonOf = (d) => new Date(d.year, d.month - 1, d.day, 12, 0).getTime();
const todayNoon = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0).getTime(); };
const toParts = (t) => { const d = new Date(t); return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() }; };

function transitText(a) {
  const T = TR_PLANET[a.t];
  return `${T.name} ${TR_VERB[a.type]} ${TR_AREA[a.n]}: ${T[nature(a.type)]}.`;
}

function renderCards() {
  const order = (k) => (SLOW.includes(k) ? 0 : 1);
  const list = [...tr.aspects].sort((x, y) => order(x.t) - order(y.t) || x.orb - y.orb);
  $('trCards').innerHTML = list.length ? list.map((a) => {
    const X = ASPECTS_INFO[a.type];
    return `<article class="card tr-card ${X.nature}${SLOW.includes(a.t) ? ' slow' : ''}">
      <span class="card-label">${TR_PLANET[a.t].name} → ${esc(targetName(a.n))}</span>
      <h3 class="card-title"><span class="glyph syn-b">${gl(PLANETS[a.t].glyph)}</span> <span class="glyph asp-sym">${gl(X.glyph)}</span> <span class="glyph">${targetGlyph(a.n)}</span> ${X.name}</h3>
      <p class="card-hint">${a.applying ? 'набирает силу' : 'ослабевает'} · орб ${a.orb.toFixed(1)}° · ${TR_PLANET[a.t].length}</p>
      <p class="card-text">${esc(transitText(a))}</p>
    </article>`;
  }).join('') : '<p class="muted center">На эту дату точных транзитов нет — спокойный период.</p>';
  ctx.revealAll($('trCards'));
}

function renderMoon() {
  const moon = tr.sky.find((p) => p.key === 'moon');
  const retro = tr.sky.filter((p) => p.retro).map((p) => PLANETS[p.key].name);
  $('trMoon').innerHTML = `<span class="glyph">${gl('☽')}</span> Луна в ${SIGNS_INFO[moon.sign].gen}: ${MOON_DAY[moon.sign]}.`
    + (retro.length ? ` <span class="muted">Ретроградны: ${retro.join(', ')}.</span>` : '');
}

function selectPoint(id) {
  const who = id[0], key = id.slice(1);
  if (who === 'B') {
    const p = tr.sky.find((x) => x.key === key);
    const house = chart.houses ? ` · в твоём ${ROMAN[houseOf(p.lon, chart.houses.cusps) - 1]} доме` : '';
    const links = tr.aspects.filter((a) => a.t === key).map((a) => `${gl(ASPECTS_INFO[a.type].glyph)} ${targetName(a.n)}`);
    $('trInfo').innerHTML = `<strong><span class="glyph">${gl(PLANETS[key].glyph)}</span> ${PLANETS[key].name} на ${formatDate(toParts(ms))}: ${SIGNS_INFO[p.sign].name} ${formatDeg(p.lon)}${p.retro ? ' · ретроградный' : ''}${house}</strong>`
      + (links.length ? `Касается твоей карты: <span class="glyph">${links.join(', ')}</span>` : 'С твоей картой сейчас точных аспектов не образует.');
  } else {
    const p = chart.planets.find((x) => x.key === key);
    const links = tr.aspects.filter((a) => a.n === key).map((a) => `${gl(PLANETS[a.t].glyph)} ${TR_PLANET[a.t].name} ${ASPECTS_INFO[a.type].name.toLowerCase()}`);
    $('trInfo').innerHTML = `<strong><span class="glyph">${gl(PLANETS[key].glyph)}</span> В твоей карте: ${PLANETS[key].name} — ${SIGNS_INFO[p.sign].name} ${formatDeg(p.lon)}</strong>`
      + (links.length ? `Сейчас затрагивают: <span class="glyph">${links.join(', ')}</span>` : 'Сейчас транзиты эту точку не затрагивают.');
  }
}

function renderCalendar() {
  const events = upcomingTransits(chart, todayNoon(), 365);
  // Объединяем повторные касания у разворота планеты в один период
  const merged = [];
  for (const e of events) {
    const prev = merged.find((m) => m.t === e.t && m.n === e.n && m.type === e.type && e.ms - m.to < 60 * DAY);
    if (prev) prev.to = e.ms;
    else merged.push({ ...e, from: e.ms, to: e.ms });
  }
  const items = merged.slice(0, 14);
  $('trCal').innerHTML = items.length ? items.map((e) => {
    const X = ASPECTS_INFO[e.type];
    const same = new Date(e.from).getFullYear() === new Date(e.to).getFullYear();
    const when = e.to - e.from < DAY ? ruDate.format(e.from) : `${(same ? ruDay : ruDate).format(e.from)} — ${ruDate.format(e.to)}`;
    return `<li class="tr-ev ${X.nature}">
      <span class="tr-when">${when.replace(/ г\.$/, '')}</span>
      <span class="tr-what"><span class="glyph syn-b">${gl(PLANETS[e.t].glyph)}</span> <span class="glyph asp-sym">${gl(X.glyph)}</span> <span class="glyph">${targetGlyph(e.n)}</span>
        <b>${TR_PLANET[e.t].name} — ${X.name.toLowerCase()} — ${esc(targetName(e.n))}</b>
        <small>${TR_PLANET[e.t].name} ${TR_VERB[e.type]} ${TR_AREA[e.n]}${e.to - e.from >= DAY ? ' (несколько касаний из-за ретроградности)' : ''}</small></span>
    </li>`;
  }).join('') : '<li class="muted">В ближайший год точных транзитов медленных планет к главным точкам нет.</li>';
}

function update() {
  tr = calcTransits(chart, ms);
  $('trDate').value = formatDate(toParts(ms));
  renderMoon();
  drawBiWheel($('trWheel'), {
    inner: chart, outer: tr.sky,
    aspects: tr.aspects.map((a) => ({ a: a.n, b: a.t, type: a.type, orb: a.orb, max: TR_ORB[a.t] })),
    labelA: 'твоя карта', labelB: 'небо', skipOuterPairs: false,
    onPick: selectPoint, play: ctx.playWhenVisible,
  });
  $('trInfo').innerHTML = 'Нажми на планету: внутри — твоя карта, снаружи — небо на выбранную дату';
  renderCards();
}

export function renderTransits(natalChart) {
  chart = natalChart;
  ms = todayNoon();
  update();
  renderCalendar();
}

export function initTransits(helpers) {
  ctx = helpers;
  const input = $('trDate');
  const err = (msg) => { const e = input.parentElement.querySelector('.error'); e.textContent = msg || ''; e.hidden = !msg; };
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 8);
    let out = digits.slice(0, 2);
    if (digits.length > 2) out += '.' + digits.slice(2, 4);
    if (digits.length > 4) out += '.' + digits.slice(4, 8);
    input.value = out;
    err('');
    if (digits.length === 8) {
      const d = parseDate(out);
      if (d) { ms = noonOf(d); update(); } else err('Проверь дату');
    }
  });
  $('trPrev').addEventListener('click', () => { if (chart) { ms -= 7 * DAY; update(); } });
  $('trNext').addEventListener('click', () => { if (chart) { ms += 7 * DAY; update(); } });
  $('trToday').addEventListener('click', () => { if (chart) { ms = todayNoon(); update(); } });
}
