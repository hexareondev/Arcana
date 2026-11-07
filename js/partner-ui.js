// Портрет партнёра в натальной карте и совпадение с ним в синастрии.
import { partnerPortrait, loveWindows, portraitMatch, formatDeg } from './natal.js?v=10';
import { PLANETS, SIGNS_INFO, HOUSES_INFO, ASPECTS_INFO } from './natal-texts.js?v=10';
import { IN_SIGN } from './natal-signs.js?v=10';
import { IN_HOUSE } from './natal-houses.js?v=10';
import { DSC_IN, MEET_HOUSE, MARS_ATTRACT, MOON_NEED, LOVE_WINDOW, LOVE_TARGET } from './partner-texts.js?v=10';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gl = (s) => s + '︎';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const DAY = 86400000;
const ruMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const monthLabel = (ms) => ruMonth.format(ms).replace(/ г\.$/, '');

const card = (label, hint, title, text) => `<article class="card">
  <span class="card-label">${label}</span>${hint ? `<p class="card-hint">${hint}</p>` : ''}
  <h3 class="card-title">${title}</h3><p class="card-text">${text}</p></article>`;

export function renderPartner(chart, ctx) {
  const pp = partnerPortrait(chart);
  const P = (k) => chart.planets.find((p) => p.key === k);
  const venus = P('venus'), mars = P('mars'), moon = P('moon');
  const html = [];

  if (pp) {
    const S = SIGNS_INFO[pp.dscSign];
    html.push(card('Кого ты ищешь', 'Десцендент — начало VII дома партнёрства',
      `<span class="glyph">${gl(S.glyph)}</span> Десцендент в ${S.gen} ${formatDeg(pp.dsc)}`, DSC_IN[pp.dscSign]));
    const R = pp.ruler, RS = SIGNS_INFO[R.sign];
    html.push(card('Где встретить', `Управитель VII дома — ${PLANETS[R.key].name}`,
      `<span class="glyph">${gl(PLANETS[R.key].glyph)}</span> в ${RS.gen} · ${ROMAN[R.house - 1]} дом`,
      `${MEET_HOUSE[R.house - 1]} Чувства такой человек проявляет ${RS.manner}.`));
    if (pp.in7.length) {
      html.push(card('Планеты в VII доме', 'Они добавляют черты к портрету партнёра',
        pp.in7.map((p) => `<span class="glyph">${gl(PLANETS[p.key].glyph)}</span>`).join(' ') + ' ' + pp.in7.map((p) => PLANETS[p.key].name).join(', '),
        pp.in7.map((p) => `<b>${PLANETS[p.key].name}.</b> ${IN_HOUSE[p.key][6]}`).join(' ')));
    }
  }
  html.push(card('Как ты любишь', 'Венера — твой стиль в любви',
    `<span class="glyph">${gl('♀')}</span> Венера в ${SIGNS_INFO[venus.sign].gen}`, IN_SIGN.venus[venus.sign]));
  html.push(card('Кто тебя притягивает', 'Марс — что вызывает влечение',
    `<span class="glyph">${gl('♂')}</span> Марс в ${SIGNS_INFO[mars.sign].gen}`, MARS_ATTRACT[mars.sign]));
  html.push(card('Что нужно рядом', 'Луна — эмоциональные потребности',
    `<span class="glyph">${gl('☽')}</span> Луна в ${SIGNS_INFO[moon.sign].gen}`, MOON_NEED[moon.sign]));
  $('ptCards').innerHTML = html.join('');
  $('ptNoTime').hidden = !!pp;

  // Периоды на два года вперёд: касание ± около месяца, повторы у разворота планеты объединяем
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const events = loveWindows(chart, now.getTime(), 730);
  const merged = [];
  for (const e of events) {
    const prev = merged.find((m) => m.t === e.t && m.n === e.n && m.type === e.type && e.ms - m.to < 120 * DAY);
    if (prev) prev.to = e.ms; else merged.push({ ...e, from: e.ms, to: e.ms });
  }
  $('ptCal').innerHTML = merged.length ? merged.map((e) => {
    const start = Math.max(now.getTime(), e.from - 30 * DAY), end = e.to + 30 * DAY;
    const a = monthLabel(start), b = monthLabel(end);
    const when = a === b ? a : a.slice(-4) === b.slice(-4) ? `${a.slice(0, -5)} — ${b}` : `${a} — ${b}`;
    const X = ASPECTS_INFO[e.type];
    const target = e.n === 'ruler7' ? `к управителю VII дома (${PLANETS[e.planet].name})` : LOVE_TARGET[e.n];
    return `<li class="tr-ev soft">
      <span class="tr-when">${when}</span>
      <span class="tr-what"><span class="glyph syn-b">${gl(PLANETS[e.t].glyph)}</span> <span class="glyph asp-sym">${gl(X.glyph)}</span>
        <b>${LOVE_WINDOW[e.t][e.type]}</b>
        <small>${PLANETS[e.t].name} — ${X.name.toLowerCase()} ${target}${e.to - e.from >= DAY ? '; несколько касаний из-за ретроградности' : ''}</small></span>
    </li>`;
  }).join('') : '<li class="muted">В ближайшие два года ярких «любовных» транзитов медленных планет нет — отношения развиваются в своём ритме.</li>';
  ctx.revealAll($('ptBlock'));
}

// ── Совпадение с портретом в синастрии ─────────────
const KIND = {
  sign: (who, k, S) => `${k === 'asc' ? 'Асцендент' : PLANETS[k].name} (${who}) в ${S.gen} — знаке десцендента`,
  house: (who, k) => `${PLANETS[k].name} (${who}) попадает в VII дом партнёрства`,
  dsc: (who, k) => `${PLANETS[k].name} (${who}) точно на десценденте`,
};

function matchColumn(owner, other, res) {
  if (!res) return `<div class="ov-col"><h3>Портрет: ${esc(owner)}</h3><p class="muted small">Нужно время рождения: ${esc(owner)}</p></div>`;
  const S = SIGNS_INFO[res.dscSign];
  const n = res.matches.length;
  const verdict = n >= 3 ? 'Очень похож на портрет партнёра' : n >= 1 ? 'Есть черты из портрета партнёра' : 'По портрету не похож — притяжение строится на другом';
  const items = res.matches.map((m) => `<li><span class="glyph">${m.key === 'asc' ? 'AC' : gl(PLANETS[m.key].glyph)}</span><span>${esc(KIND[m.kind](other, m.key, S))}</span></li>`).join('');
  return `<div class="ov-col"><h3>${esc(other)} → портрет: ${esc(owner)}</h3>
    <p class="pm-verdict${n >= 3 ? ' strong' : n ? '' : ' none'}">${verdict}</p>
    <p class="muted small">Десцендент (${esc(owner)}) — ${S.name}</p>
    ${items ? `<ul>${items}</ul>` : ''}</div>`;
}

export function renderPortraitMatch({ ca, cb, na, nb }) {
  const ab = portraitMatch(ca, cb), ba = portraitMatch(cb, ca);
  $('sMatchBlock').hidden = !ab && !ba;
  $('sMatch').innerHTML = matchColumn(na, nb, ab) + matchColumn(nb, na, ba);
}
