import { calcMatrix, calcHealth, calcPair, calcYears, ageAt, activePoint, parseDate, formatDate } from './matrix.js?v=3';
import { ARCANA, POSITIONS, PAIR, PAIR_POSITIONS, CHAKRAS, YEARS } from './arcana.js?v=3';
import { drawStory } from './story.js?v=3';
import { initNatal, openNatal, natalFromHash, natalCurrent } from './natal-ui.js?v=3';

const $ = (id) => document.getElementById(id);

const SLOGANS = [
  'Всё, что звёзды и числа<br>знают о тебе',
  'Прочти себя<br>по звёздам и числам',
  'Твоя судьба —<br>в дате рождения',
];

const STORAGE_KEY = 'arcana.saved.v1';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Пол: 'f' — женский, 'm' — мужской, 'n' — не указан (нейтральные формулировки)
let gender = 'n';
const GENDER_IDX = { f: 0, m: 1, n: 2 };
const g = (t) => t.replace(/\{([^{}|]*)\|([^{}|]*)\|([^{}|]*)\}/g, (_, ...p) => p[GENDER_IDX[gender] ?? 2]);
const arc = (n) => {
  const src = ARCANA[n], out = {};
  for (const [k, v] of Object.entries(src)) out[k] = Array.isArray(v) ? v.map(g) : (typeof v === 'string' ? g(v) : v);
  return out;
};
const readGender = () => (document.querySelector('input[name=gender]:checked') || {}).value || 'n';
const setGender = (v) => {
  gender = ['f', 'm'].includes(v) ? v : 'n';
  const el = document.querySelector(`input[name=gender][value=${gender}]`);
  if (el) el.checked = true;
};
const arcTitle = (n) => `${arc(n).roman} · ${arc(n).name}`;

// ── Слоган ─────────────────────────────────────────
$('slogan').innerHTML = SLOGANS[Math.floor(Math.random() * SLOGANS.length)];

// ── Маска даты для всех полей с датой ──────────────
const errorOf = (input) => input.parentElement.querySelector('.error');
document.querySelectorAll('.date-input').forEach((input) => {
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 8);
    let out = digits.slice(0, 2);
    if (digits.length > 2) out += '.' + digits.slice(2, 4);
    if (digits.length > 4) out += '.' + digits.slice(4, 8);
    input.value = out;
    hideError(input);
  });
});

function showError(input, msg) {
  const el = errorOf(input);
  el.textContent = msg;
  el.hidden = false;
  input.setAttribute('aria-invalid', 'true');
}
function hideError(input) {
  errorOf(input).hidden = true;
  input.removeAttribute('aria-invalid');
}
function readDate(input) {
  const date = parseDate(input.value);
  if (!date) showError(input, input.value ? 'Проверь дату: нужен формат ДД.ММ.ГГГГ, например 15.03.1995' : 'Введи дату рождения');
  return date;
}

// ── Вкладки ────────────────────────────────────────
let mode = 'single';
function setMode(next) {
  mode = next;
  document.querySelectorAll('.tab[data-mode]').forEach((t) => {
    const on = t.dataset.mode === next;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  $('form').hidden = next !== 'single';
  $('pairForm').hidden = next !== 'pair';
  $('natalForm').hidden = next !== 'natal';
  document.body.classList.remove('mode-single', 'mode-pair', 'mode-natal');
  document.body.classList.add('mode-' + next);
  const ph = document.querySelector('.ph-empty');
  if (ph) ph.innerHTML = next === 'natal' ? 'Введи дату, время и город —<br>здесь появится твоя карта'
    : next === 'pair' ? 'Введи две даты —<br>здесь появится матрица пары' : 'Введи дату рождения —<br>здесь появится твоя матрица';
  $('result').hidden = !(current && current.type === next);
  $('natalResult').hidden = !(next === 'natal' && natalCurrent);
}
document.querySelectorAll('.tab[data-mode]').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

// ── Хранилище ──────────────────────────────────────
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function storeSaved(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
function updateBadge() {
  const n = loadSaved().length;
  $('savedCount').textContent = n;
  $('savedCount').hidden = n === 0;
}

// ── Текущее состояние ──────────────────────────────
// single: { type, name, date, m, g }   pair: { type, n1, n2, d1, d2, m1, m2, m }
let current = null;

// ── Анимации появления ─────────────────────────────
const isPlayable = (el) => el.classList.contains('chart') || el.classList.contains('wheel');
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add(isPlayable(e.target) ? 'play' : 'in');
      io.unobserve(e.target);
    }
  }, { threshold: 0.12 })
  : null;
function playWhenVisible(el) {
  if (io) io.observe(el);
  else el.classList.add(isPlayable(el) ? 'play' : 'in');
}
function revealAll(root) {
  root.querySelectorAll('.card, .health-table tbody tr, .health-table tfoot tr, .year-row').forEach((el, i) => {
    el.classList.add('reveal');
    el.style.setProperty('--i', String(i % 2));
    playWhenVisible(el);
  });
}

// ── Звёзды в шапке ─────────────────────────────────
(function stars() {
  const box = document.createElement('div');
  box.className = 'stars';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 26; i++) {
    const st = document.createElement('span');
    const size = Math.random() < 0.2 ? 3 : (Math.random() < 0.5 ? 2 : 1.5);
    st.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${size}px;height:${size}px;`
      + `animation-delay:${(Math.random() * 6).toFixed(2)}s;animation-duration:${(3 + Math.random() * 4).toFixed(2)}s`;
    box.appendChild(st);
  }
  document.querySelector('.hero').prepend(box);
})();

// ── Схема ──────────────────────────────────────────
const C0 = 180;
const OUT = 150, MID = 104, IN = 62, SQ = 106;
const LAYOUT = {
  A: [C0 - OUT, C0, 'outer'], B: [C0, C0 - OUT, 'outer'], C: [C0 + OUT, C0, 'outer'], D: [C0, C0 + OUT, 'outer'],
  F: [C0 - SQ, C0 - SQ, 'ancestral'], G: [C0 + SQ, C0 - SQ, 'ancestral'], H: [C0 + SQ, C0 + SQ, 'ancestral'], I: [C0 - SQ, C0 + SQ, 'ancestral'],
  a1: [C0 - MID, C0, 'inner'], a2: [C0 - IN, C0, 'inner'],
  b1: [C0, C0 - MID, 'inner'], b2: [C0, C0 - IN, 'inner'],
  c1: [C0 + MID, C0, 'inner'], c2: [C0 + IN, C0, 'inner'],
  d1: [C0, C0 + MID, 'inner'], d2: [C0, C0 + IN, 'inner'],
  E: [C0, C0, 'center'],
};

const POINT_INFO = {
  A: 'Визитная карточка — каким тебя видят люди',
  B: 'Таланты, данные от рождения',
  C: 'Реализация в материальном мире',
  D: 'Кармическая задача — главный урок',
  E: 'Центр — твой характер и зона комфорта',
  F: 'Род по линии отца: духовное наследие',
  G: 'Род по линии матери: духовное наследие',
  H: 'Род по линии отца: материальное наследие',
  I: 'Род по линии матери: материальное наследие',
  a1: 'Личные качества', a2: 'Личные качества, глубинный уровень',
  b1: 'Таланты: второй уровень', b2: 'Таланты: глубинный уровень',
  c1: 'Материальная сфера', c2: 'Материальная сфера, вход в денежный канал',
  d1: 'Кармический хвост, середина', d2: 'Кармический хвост, внутренняя точка',
};
const POINT_INFO_PAIR = {
  A: 'Пара со стороны — какими вас видят',
  B: 'Ресурс пары — что вас наполняет',
  C: 'Совместная реализация в мире',
  D: 'Задача пары',
  E: 'Атмосфера пары — что связывает вас внутри',
  F: 'Родовая программа пары (линия отцов)',
  G: 'Родовая программа пары (линия матерей)',
  H: 'Родовая программа пары (линия отцов)',
  I: 'Родовая программа пары (линия матерей)',
  a1: 'Как вы проявляетесь вместе', a2: 'Как вы проявляетесь вместе, глубинный уровень',
  b1: 'Ресурс пары: второй уровень', b2: 'Ресурс пары: глубинный уровень',
  c1: 'Материальная сфера пары', c2: 'Вход в денежный канал пары',
  d1: 'Кармический хвост пары, середина', d2: 'Кармический хвост пары, внутренняя точка',
};
const pointLabel = (key) => (current && current.type === 'pair' ? POINT_INFO_PAIR : POINT_INFO)[key];

function shapeFor(kind, x, y) {
  switch (kind) {
    case 'outer': return `<rect class="shape" x="${x - 18}" y="${y - 18}" width="36" height="36" transform="rotate(45 ${x} ${y})"/>`;
    case 'ancestral': return `<rect class="shape" x="${x - 15}" y="${y - 15}" width="30" height="30"/>`;
    case 'center': return `<circle class="shape" cx="${x}" cy="${y}" r="27"/><circle cx="${x}" cy="${y}" r="22" fill="none" stroke="#0F2B26"/>`;
    default: return `<circle class="shape" cx="${x}" cy="${y}" r="12"/>`;
  }
}

function drawChart(m) {
  const sz = { outer: 18, ancestral: 16, inner: 12, center: 22 };
  let s = `
    <circle class="ring" cx="${C0}" cy="${C0}" r="${OUT}"/>
    <circle class="ring-dots" cx="${C0}" cy="${C0}" r="${OUT + 10}"/>
    <path class="ln draw" pathLength="1" d="M${C0 - OUT} ${C0} L${C0} ${C0 - OUT} L${C0 + OUT} ${C0} L${C0} ${C0 + OUT} Z"/>
    <rect class="ln ln-mid draw" pathLength="1" style="--d:250ms" x="${C0 - SQ}" y="${C0 - SQ}" width="${SQ * 2}" height="${SQ * 2}"/>
    <path class="ln ln-soft draw" pathLength="1" style="--d:450ms" d="M${C0 - SQ} ${C0 - SQ} L${C0 + SQ} ${C0 + SQ} M${C0 + SQ} ${C0 - SQ} L${C0 - SQ} ${C0 + SQ} M${C0 - OUT} ${C0} H${C0 + OUT} M${C0} ${C0 - OUT} V${C0 + OUT}"/>
    <path class="ln ln-mid" stroke-dasharray="3 3" d="M${C0 + IN} ${C0} L${C0} ${C0 + IN}"/>`;
  const order = { outer: 0, ancestral: 1, inner: 2, center: 3 };
  const counters = { outer: 0, ancestral: 0, inner: 0, center: 0 };
  for (const [key, [x, y, kind]] of Object.entries(LAYOUT)) {
    const n = m[key];
    const delay = 500 + order[kind] * 320 + (counters[kind]++) * 45;
    s += `<g class="pt ${kind}" style="--d:${delay}ms" data-key="${key}" tabindex="0" role="button" aria-label="${esc(pointLabel(key))}: ${n}, ${esc(arc(n).name)}">
      ${shapeFor(kind, x, y)}<text x="${x}" y="${y + 1}" font-size="${sz[kind]}">${n}</text></g>`;
  }
  const chart = $('chart');
  chart.classList.remove('play');
  chart.innerHTML = s;
  playWhenVisible(chart);
  chart.querySelectorAll('.pt').forEach((el) => {
    const pick = () => selectPoint(el.dataset.key);
    el.addEventListener('click', pick);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  $('pointInfo').innerHTML = 'Нажми на любое число в схеме, чтобы узнать, что оно значит';
}

function selectPoint(key) {
  const n = current.m[key];
  $('chart').querySelectorAll('.pt').forEach((el) => el.classList.toggle('sel', el.dataset.key === key));
  $('pointInfo').innerHTML = `<strong>${n} · ${esc(arc(n).name)}</strong>${esc(pointLabel(key))}<br><span class="muted">${esc(arc(n).keys.join(' · '))}</span>`;
}

// ── Карточки ───────────────────────────────────────
function card({ label, hint, n, text, minus, extra = '', wide = false }) {
  const a = arc(n);
  return `<article class="card${wide ? ' wide' : ''}">
    <span class="card-label">${label}</span>
    ${hint ? `<p class="card-hint">${hint}</p>` : ''}
    <h3 class="card-title">${arcTitle(n)}</h3>
    <div class="chips">${a.keys.map((k) => `<span class="chip">${k}</span>`).join('')}</div>
    ${extra}
    <p class="card-text">${text}</p>
    ${minus ? `<details><summary>Если энергия в минусе</summary><p>${minus}</p></details>` : ''}
  </article>`;
}

const tailHtml = ([t1, t2, t3], label) =>
  `<div class="tail" aria-label="${label} ${t1}, ${t2}, ${t3}">${t1}<span class="sep">·</span>${t2}<span class="sep">·</span>${t3}</div>`;

function renderCards(m) {
  const html = [];
  for (const key of ['E', 'A', 'B', 'C', 'money', 'love']) {
    const p = POSITIONS[key], n = m[key];
    html.push(card({ label: p.title, hint: p.hint, n, text: arc(n)[p.aspect], minus: arc(n).minus }));
  }

  const [t1, t2] = m.tail;
  html.push(card({
    label: 'Кармический хвост',
    hint: 'Задачи, которые душа принесла с собой. С рождения эта зона в минусе — это точка роста.',
    n: m.D,
    extra: tailHtml(m.tail, 'Кармический хвост'),
    text: `${arc(m.D).lesson} Внутри хвоста — ${arc(t1).name} и ${arc(t2).name}: присмотрись к темам «${arc(t1).keys[0]}» и «${arc(t2).keys[0]}» — через них задача и проявляется.`,
    minus: arc(m.D).minus,
  }));

  const pp = m.purpose;
  const cell = (label, n) => `<div><span class="g-label">${label}</span><span class="g-num">${n}</span><span class="g-name">${arc(n).name}</span></div>`;
  html.push(`<article class="card span2">
    <span class="card-label">Предназначение</span>
    <p class="card-hint">Личное — до 40 лет, социальное — 40–60, духовное — после 60.</p>
    <div class="grid-purpose">
      ${cell('Личное', pp.personal)}${cell('Социальное', pp.social)}
      ${cell('Духовное', pp.spiritual)}${cell('Планетарное', pp.planetary)}
    </div>
    <p class="card-text"><b>Личное — ${arc(pp.personal).name}.</b> ${arc(pp.personal).lesson}</p>
    <p class="card-text"><b>Социальное — ${arc(pp.social).name}.</b> ${arc(pp.social).lesson}</p>
    <p class="card-text"><b>Духовное — ${arc(pp.spiritual).name}.</b> ${arc(pp.spiritual).lesson}</p>
  </article>`);

  $('cards').innerHTML = html.join('');
  revealAll($('cards'));
}

function renderPairCards() {
  const { m, m1, m2, n1, n2 } = current;
  const html = [];
  const name1 = n1 || 'Первый партнёр', name2 = n2 || 'Второй партнёр';
  html.push(`<article class="card wide">
    <span class="card-label">Вы по отдельности</span>
    <p class="card-hint">Центры личных матриц — характер каждого.</p>
    <div class="duo">
      <div><span class="g-label">${esc(name1)}</span><span class="g-num">${m1.E}</span><span class="g-name">${arc(m1.E).name}</span></div>
      <div><span class="g-label">${esc(name2)}</span><span class="g-num">${m2.E}</span><span class="g-name">${arc(m2.E).name}</span></div>
    </div>
  </article>`);

  for (const key of ['E', 'A', 'B']) {
    const p = PAIR_POSITIONS[key], n = m[key];
    html.push(card({ label: p.title, hint: p.hint, n, text: PAIR[n].pair }));
  }
  html.push(card({ label: PAIR_POSITIONS.money.title, hint: PAIR_POSITIONS.money.hint, n: m.money, text: arc(m.money).money }));
  html.push(card({
    label: PAIR_POSITIONS.D.title,
    hint: PAIR_POSITIONS.D.hint,
    n: m.D,
    extra: tailHtml(m.tail, 'Кармический хвост пары'),
    text: PAIR[m.D].task,
    minus: arc(m.D).minus,
  }));
  html.push(card({
    label: 'Предназначение пары',
    hint: 'Зачем вы встретились и что можете дать друг другу.',
    n: m.purpose.personal,
    text: `${PAIR[m.purpose.personal].pair} ${PAIR[m.purpose.personal].task}`,
  }));
  $('cards').innerHTML = html.join('');
  revealAll($('cards'));
}

// ── Прогноз по годам ───────────────────────────────
const yearsWord = (n) => {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'год';
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 'года';
  return 'лет';
};

function renderYears(m, date) {
  const decades = calcYears(m);
  const age = ageAt(date);
  const now = activePoint(age);
  let selDecade = now ? now.decade : 0;

  if (now) {
    const p = decades[now.decade].points[now.k];
    const next = decades[(now.decade + (now.k === 7 ? 1 : 0)) % 8].points[(now.k + 1) % 8];
    const full = Math.floor(age);
    const cycle = age >= 80 ? ' (второй круг)' : '';
    $('yearNow').innerHTML = card({
      wide: true,
      label: 'Твой период сейчас',
      hint: `Тебе ${full} ${yearsWord(full)}${cycle} · отрезок ${p.label} ${/–/.test(p.label) ? 'лет' : yearsWord(Number(p.label))}`,
      n: p.value,
      text: g(YEARS[p.value]),
      extra: `<p class="card-hint">Следующий отрезок — ${next.label}: ${esc(arc(next.value).name)}</p>`,
    });
  } else {
    $('yearNow').innerHTML = '';
  }

  const drawDecade = (di) => {
    selDecade = di;
    $('decades').querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('active', i === di);
      b.setAttribute('aria-selected', String(i === di));
    });
    const d = decades[di];
    $('yearList').innerHTML = d.points.map((p) => {
      const isNow = now && now.decade === di && now.k === p.k;
      const a = arc(p.value);
      return `<li><button type="button" class="year-row${isNow ? ' now' : ''}" data-k="${p.k}">
        <span class="yr-age">${p.label}</span>
        <span class="yr-num">${p.value}</span>
        <span class="yr-name">${esc(a.name)}<small>${esc(a.keys.join(' · '))}</small></span>
        ${isNow ? '<span class="yr-badge">сейчас</span>' : ''}
      </button></li>`;
    }).join('');
    const pick = (k) => {
      const p = d.points[k];
      $('yearList').querySelectorAll('.year-row').forEach((r) => r.classList.toggle('sel', Number(r.dataset.k) === k));
      $('yearInfo').innerHTML = `<strong>${p.label} ${/–/.test(p.label) ? 'лет' : yearsWord(Number(p.label))} · ${esc(arcTitle(p.value))}</strong>${esc(g(YEARS[p.value]))}`;
    };
    $('yearList').querySelectorAll('.year-row').forEach((r) => r.addEventListener('click', () => pick(Number(r.dataset.k))));
    pick(now && now.decade === di ? now.k : 0);
    revealAll($('yearList'));
  };

  $('decades').innerHTML = decades.map((d, i) =>
    `<button type="button" role="tab" class="decade${now && now.decade === i ? ' has-now' : ''}">${d.from}–${d.to}</button>`).join('');
  $('decades').querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => drawDecade(i)));
  drawDecade(selDecade);
  const act = $('decades').querySelectorAll('button')[selDecade];
  if (act) $('decades').scrollLeft = act.offsetLeft - ($('decades').clientWidth - act.offsetWidth) / 2;
}

// ── Карта здоровья ─────────────────────────────────
function renderHealth(m) {
  const h = calcHealth(m);
  const numCell = (n) => `<td><span class="cell"><span class="num">${n}</span><span class="num-name">${esc(arc(n).name)}</span></span></td>`;
  $('healthBody').innerHTML = h.rows.map((r) => {
    const c = CHAKRAS[r.key];
    return `<tr data-key="${r.key}" tabindex="0" aria-label="${c.name}: физика ${r.phys}, энергия ${r.energy}, эмоции ${r.emo}">
      <td><span class="cell"><span class="ch-name">${c.name}</span><span class="ch-place">${c.place}</span></span></td>
      ${numCell(r.phys)}${numCell(r.energy)}${numCell(r.emo)}
    </tr>`;
  }).join('');
  $('healthFoot').innerHTML = `<tr><td><span class="cell"><span class="ch-name">Итог</span></span></td>${numCell(h.total.phys)}${numCell(h.total.energy)}${numCell(h.total.emo)}</tr>`;

  const k = h.total.emo;
  $('healthKey').innerHTML = `<div class="chakra-info" id="chakraInfo">Нажми на чакру в таблице</div>` + card({
    label: 'Ключ здоровья',
    hint: 'Общая энергия карты: на что опираться, чтобы чувствовать себя в ресурсе.',
    n: k,
    text: arc(k).plus,
    minus: arc(k).minus,
  });

  revealAll($('health'));

  $('healthBody').querySelectorAll('tr').forEach((tr) => {
    const pick = () => {
      const r = h.rows.find((x) => x.key === tr.dataset.key);
      const c = CHAKRAS[r.key];
      $('healthBody').querySelectorAll('tr').forEach((x) => x.classList.toggle('sel', x === tr));
      $('chakraInfo').innerHTML = `<strong>${c.name} · ${c.place}</strong>${c.sphere}<br><span class="muted">Физика — ${esc(arc(r.phys).name)}, энергия — ${esc(arc(r.energy).name)}, эмоции — ${esc(arc(r.emo).name)}</span>`;
    };
    tr.addEventListener('click', pick);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}

// ── Показ результата ───────────────────────────────
function scrollToResult() {
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// Пока результата нет, на ПК справа видна заглушка; после расчёта она подсказывает, что матрица ниже.
const resultObserver = new MutationObserver(() =>
  document.body.classList.toggle('has-result', !$('result').hidden || !$('natalResult').hidden));
resultObserver.observe($('result'), { attributes: true, attributeFilter: ['hidden'] });
resultObserver.observe($('natalResult'), { attributes: true, attributeFilter: ['hidden'] });
$('toResult').addEventListener('click', scrollToResult);
function setHash(params) {
  history.replaceState(null, '', '#' + new URLSearchParams(params).toString());
}

function show(name, date, { scroll = true, sex } = {}) {
  if (sex) setGender(sex);
  const m = calcMatrix(date);
  current = { type: 'single', name, date, m, g: gender };
  $('resultTitle').textContent = name ? `МАТРИЦА: ${name.toUpperCase()}` : 'ТВОЯ МАТРИЦА';
  $('resultDate').textContent = formatDate(date);
  drawChart(m);
  renderCards(m);
  renderYears(m, date);
  $('years').hidden = false;
  renderHealth(m);
  $('health').hidden = false;
  $('result').hidden = false;

  const params = { d: formatDate(date) };
  if (name) params.n = name;
  if (gender !== 'n') params.g = gender;
  setHash(params);
  if (scroll) scrollToResult();
}

function showPair(n1, d1, n2, d2, { scroll = true } = {}) {
  gender = 'n'; // в паре тексты на «вы», переключатель пола не трогаем
  const m1 = calcMatrix(d1), m2 = calcMatrix(d2);
  current = { type: 'pair', n1, n2, d1, d2, m1, m2, m: calcPair(m1, m2) };
  const both = n1 && n2 ? `${n1} + ${n2}` : '';
  $('resultTitle').textContent = 'МАТРИЦА ПАРЫ';
  $('resultDate').textContent = (both ? both + ' · ' : '') + `${formatDate(d1)} + ${formatDate(d2)}`;
  drawChart(current.m);
  renderPairCards();
  $('health').hidden = true;
  $('years').hidden = true;
  $('result').hidden = false;

  const params = { p1: formatDate(d1), p2: formatDate(d2) };
  if (n1) params.n1 = n1;
  if (n2) params.n2 = n2;
  setHash(params);
  if (scroll) scrollToResult();
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = readDate($('date'));
  if (!date) { $('date').focus(); return; }
  show($('name').value.trim(), date, { sex: readGender() });
});

$('pairForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const d1 = readDate($('date1'));
  const d2 = readDate($('date2'));
  if (!d1) { $('date1').focus(); return; }
  if (!d2) { $('date2').focus(); return; }
  showPair($('name1').value.trim(), d1, $('name2').value.trim(), d2);
});

// ── Сохранить / поделиться ─────────────────────────
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

function currentRecord() {
  if (current.type === 'pair') {
    return { t: 'pair', d1: formatDate(current.d1), d2: formatDate(current.d2), n1: current.n1, n2: current.n2 };
  }
  return { d: formatDate(current.date), n: current.name, g: current.g };
}
const sameRecord = (a, b) => (a.t || 'single') === (b.t || 'single')
  && (a.t === 'natal'
    ? a.d === b.d && a.tm === b.tm && (a.n || '') === (b.n || '') && a.p && b.p && a.p.lat === b.p.lat && a.p.lon === b.p.lon
    : a.t === 'pair'
    ? a.d1 === b.d1 && a.d2 === b.d2 && (a.n1 || '') === (b.n1 || '') && (a.n2 || '') === (b.n2 || '')
    : a.d === b.d && (a.n || '') === (b.n || '') && (a.g || 'n') === (b.g || 'n'));

function saveRecord(rec) {
  const list = loadSaved();
  if (list.some((x) => sameRecord(x, rec))) { toast('Уже сохранено'); return; }
  list.unshift({ ...rec, at: Date.now() });
  if (storeSaved(list)) { updateBadge(); toast('Сохранено в «Мои матрицы»'); }
  else toast('Не получилось сохранить: браузер запрещает хранилище');
}
$('saveBtn').addEventListener('click', () => { if (current) saveRecord(currentRecord()); });

async function shareLink(text) {
  const url = location.href;
  if (navigator.share) {
    try { await navigator.share({ title: 'Аркана', text, url }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); }
  catch { prompt('Скопируй ссылку:', url); }
}

$('shareBtn').addEventListener('click', async () => {
  if (!current) return;
  let text;
  if (current.type === 'pair') {
    text = `Атмосфера нашей пары — ${arc(current.m.E).name}. Проверь свою совместимость в «Аркане»`;
  } else {
    const who = current.name ? `${current.name}: ` : '';
    text = `${who}центр матрицы — ${arc(current.m.E).name}. Посмотри свою в «Аркане»`;
  }
  shareLink(text);
});

// ── Картинка для сторис ────────────────────────────
const storyDialog = $('storyDialog');
let storyUrl = null, storyFile = null;

function siteUrl() {
  return (location.host + location.pathname).replace(/index\.html$/, '').replace(/\/$/, '');
}

function storyOptions() {
  if (current.type === 'pair') {
    const { m, n1, n2, d1, d2 } = current;
    return {
      title: 'МАТРИЦА ПАРЫ',
      name: n1 && n2 ? `${n1} + ${n2}` : (n1 || n2 || ''),
      sub: `${formatDate(d1)}  +  ${formatDate(d2)}`,
      m, center: { label: 'Атмосфера пары', n: m.E },
      items: [{ label: 'Ресурс', n: m.B }, { label: 'Деньги', n: m.money }, { label: 'Задача', n: m.D }],
    };
  }
  const { m, name, date } = current;
  return {
    title: 'МАТРИЦА СУДЬБЫ',
    name, sub: formatDate(date),
    m, center: { label: 'Центр личности', n: m.E },
    items: [{ label: 'Таланты', n: m.B }, { label: 'Деньги', n: m.money }, { label: 'Любовь', n: m.love }],
  };
}

$('storyBtn').addEventListener('click', async () => {
  if (!current) return;
  $('storyImg').hidden = true;
  $('storyLoading').hidden = false;
  $('storyShare').hidden = true;
  storyDialog.showModal();
  try {
    const canvas = await drawStory({ ...storyOptions(), arc, url: siteUrl() });
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (storyUrl) URL.revokeObjectURL(storyUrl);
    storyUrl = URL.createObjectURL(blob);
    const base = current.type === 'pair' ? 'arcana-para' : `arcana-${formatDate(current.date)}`;
    storyFile = new File([blob], `${base}.png`, { type: 'image/png' });
    $('storyImg').src = storyUrl;
    $('storyImg').hidden = false;
    $('storyLoading').hidden = true;
    $('storyDownload').href = storyUrl;
    $('storyDownload').download = storyFile.name;
    $('storyShare').hidden = !(navigator.canShare && navigator.canShare({ files: [storyFile] }));
  } catch (err) {
    $('storyLoading').textContent = 'Не получилось нарисовать картинку. Попробуй ещё раз.';
  }
});

$('storyShare').addEventListener('click', async () => {
  if (!storyFile) return;
  try { await navigator.share({ files: [storyFile], title: 'Аркана' }); }
  catch (err) { if (err.name !== 'AbortError') toast('Не получилось отправить — попробуй «Скачать»'); }
});
$('closeStory').addEventListener('click', () => storyDialog.close());
storyDialog.addEventListener('click', (e) => { if (e.target === storyDialog) storyDialog.close(); });

// ── Мои матрицы ────────────────────────────────────
const dialog = $('savedDialog');

function renderSaved() {
  const list = loadSaved();
  $('savedEmpty').hidden = list.length > 0;
  $('savedList').innerHTML = list.map((x, i) => {
    let title, sub;
    if (x.t === 'natal') {
      title = x.n || 'Натальная карта';
      sub = `карта · ${x.d}${x.tm ? ' ' + x.tm : ''}${x.p && x.p.name ? ' · ' + x.p.name : ''}`;
    } else if (x.t === 'pair') {
      const a = parseDate(x.d1), b = parseDate(x.d2);
      const e = a && b ? calcPair(calcMatrix(a), calcMatrix(b)).E : null;
      title = `${x.n1 || '…'} + ${x.n2 || '…'}`;
      sub = `пара${e ? ' · ' + arc(e).name : ''}`;
    } else {
      const date = parseDate(x.d);
      const e = date ? calcMatrix(date).E : null;
      title = x.n || 'Без имени';
      sub = `${x.d}${e ? ' · ' + arc(e).name : ''}`;
    }
    return `<li>
      <button class="saved-open" data-i="${i}"><b>${esc(title)}</b><span>${esc(sub)}</span></button>
      <button class="saved-del" data-i="${i}" aria-label="Удалить ${esc(title)}">✕</button>
    </li>`;
  }).join('');
}

$('savedBtn').addEventListener('click', () => { renderSaved(); dialog.showModal(); });
$('closeSaved').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

function openPair(n1, d1, n2, d2) {
  $('name1').value = n1 || '';
  $('name2').value = n2 || '';
  $('date1').value = formatDate(d1);
  $('date2').value = formatDate(d2);
  showPair(n1 || '', d1, n2 || '', d2);
  setMode('pair');
}
function openSingle(n, date, sex) {
  $('name').value = n || '';
  $('date').value = formatDate(date);
  show(n || '', date, { sex: sex || 'n' });
  setMode('single');
}

$('savedList').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const list = loadSaved();
  const i = Number(btn.dataset.i);
  if (btn.classList.contains('saved-del')) {
    list.splice(i, 1);
    storeSaved(list);
    renderSaved();
    updateBadge();
    return;
  }
  const item = list[i];
  if (!item) return;
  if (item.t === 'natal') {
    dialog.close();
    setMode('natal');
    openNatal({ name: item.n || '', d: item.d, tm: item.tm, p: item.p });
    return;
  }
  if (item.t === 'pair') {
    const a = parseDate(item.d1), b = parseDate(item.d2);
    if (!a || !b) return;
    dialog.close();
    openPair(item.n1, a, item.n2, b);
  } else {
    const date = parseDate(item.d);
    if (!date) return;
    dialog.close();
    openSingle(item.n, date, item.g);
  }
});

// ── Старт: открыть матрицу из ссылки ───────────────
function fromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const clip = (s) => (s || '').slice(0, 40);
  const natal = natalFromHash(params);
  if (natal) { setMode('natal'); openNatal(natal); return; }
  const p1 = parseDate(params.get('p1')), p2 = parseDate(params.get('p2'));
  if (p1 && p2) { openPair(clip(params.get('n1')), p1, clip(params.get('n2')), p2); return; }
  const date = parseDate(params.get('d'));
  if (date) openSingle(clip(params.get('n')), date, params.get('g'));
}

initNatal({ g, toast, setHash, playWhenVisible, revealAll, saveRecord, shareLink });
document.body.classList.add('mode-single');
updateBadge();
fromHash();
