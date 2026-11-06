import { calcMatrix, parseDate, formatDate } from './matrix.js';
import { ARCANA, POSITIONS } from './arcana.js';

const $ = (id) => document.getElementById(id);

const SLOGANS = [
  'Всё, что звёзды и числа<br>знают о тебе',
  'Прочти себя<br>по звёздам и числам',
  'Твоя судьба —<br>в дате рождения',
];

const STORAGE_KEY = 'arcana.saved.v1';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Пол: 'f' — женский, 'm' — мужской, 'n' — не указан (нейтральные формулировки).
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

// ── Маска даты ─────────────────────────────────────
const dateInput = $('date');
dateInput.addEventListener('input', () => {
  const digits = dateInput.value.replace(/\D/g, '').slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += '.' + digits.slice(2, 4);
  if (digits.length > 4) out += '.' + digits.slice(4, 8);
  dateInput.value = out;
  hideError();
});

function showError(msg) {
  $('dateError').textContent = msg;
  $('dateError').hidden = false;
  dateInput.setAttribute('aria-invalid', 'true');
}
function hideError() {
  $('dateError').hidden = true;
  dateInput.removeAttribute('aria-invalid');
}

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
let current = null; // { name, date: {day, month, year}, m }

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
    <path class="ln" d="M${C0 - OUT} ${C0} L${C0} ${C0 - OUT} L${C0 + OUT} ${C0} L${C0} ${C0 + OUT} Z"/>
    <rect class="ln ln-mid" x="${C0 - SQ}" y="${C0 - SQ}" width="${SQ * 2}" height="${SQ * 2}"/>
    <path class="ln ln-soft" d="M${C0 - SQ} ${C0 - SQ} L${C0 + SQ} ${C0 + SQ} M${C0 + SQ} ${C0 - SQ} L${C0 - SQ} ${C0 + SQ} M${C0 - OUT} ${C0} H${C0 + OUT} M${C0} ${C0 - OUT} V${C0 + OUT}"/>
    <path class="ln ln-mid" stroke-dasharray="3 3" d="M${C0 + IN} ${C0} L${C0} ${C0 + IN}"/>`;
  for (const [key, [x, y, kind]] of Object.entries(LAYOUT)) {
    const n = m[key];
    s += `<g class="pt ${kind}" data-key="${key}" tabindex="0" role="button" aria-label="${esc(POINT_INFO[key])}: ${n}, ${esc(arc(n).name)}">
      ${shapeFor(kind, x, y)}<text x="${x}" y="${y + 1}" font-size="${sz[kind]}">${n}</text></g>`;
  }
  const chart = $('chart');
  chart.innerHTML = s;
  chart.querySelectorAll('.pt').forEach((g) => {
    const pick = () => selectPoint(g.dataset.key);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
}

function selectPoint(key) {
  const n = current.m[key];
  $('chart').querySelectorAll('.pt').forEach((g) => g.classList.toggle('sel', g.dataset.key === key));
  $('pointInfo').innerHTML = `<strong>${n} · ${esc(arc(n).name)}</strong>${esc(POINT_INFO[key])}<br><span class="muted">${esc(arc(n).keys.join(' · '))}</span>`;
}

// ── Карточки ───────────────────────────────────────
function card({ label, hint, n, text, minus, extra = '' }) {
  const a = arc(n);
  return `<article class="card">
    <span class="card-label">${label}</span>
    ${hint ? `<p class="card-hint">${hint}</p>` : ''}
    <h3 class="card-title">${arcTitle(n)}</h3>
    <div class="chips">${a.keys.map((k) => `<span class="chip">${k}</span>`).join('')}</div>
    ${extra}
    <p class="card-text">${text}</p>
    ${minus ? `<details><summary>Если энергия в минусе</summary><p>${minus}</p></details>` : ''}
  </article>`;
}

function renderCards(m) {
  const html = [];
  for (const key of ['E', 'A', 'B', 'C']) {
    const p = POSITIONS[key], n = m[key];
    html.push(card({ label: p.title, hint: p.hint, n, text: arc(n)[p.aspect], minus: arc(n).minus }));
  }
  for (const key of ['money', 'love']) {
    const p = POSITIONS[key], n = m[key];
    html.push(card({ label: p.title, hint: p.hint, n, text: arc(n)[p.aspect], minus: arc(n).minus }));
  }

  // Кармический хвост
  const [t1, t2, t3] = m.tail;
  html.push(card({
    label: 'Кармический хвост',
    hint: 'Задачи, которые душа принесла с собой. С рождения эта зона в минусе — это точка роста.',
    n: m.D,
    extra: `<div class="tail" aria-label="Кармический хвост ${t1}, ${t2}, ${t3}">${t1}<span class="sep">·</span>${t2}<span class="sep">·</span>${t3}</div>`,
    text: `${arc(m.D).lesson} Внутри хвоста — ${arc(t1).name} и ${arc(t2).name}: присмотрись к темам «${arc(t1).keys[0]}» и «${arc(t2).keys[0]}» — через них задача и проявляется.`,
    minus: arc(m.D).minus,
  }));

  // Предназначение
  const pp = m.purpose;
  const cell = (label, n) => `<div><span class="g-label">${label}</span><span class="g-num">${n}</span><span class="g-name">${arc(n).name}</span></div>`;
  html.push(`<article class="card">
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
}

// ── Показ результата ───────────────────────────────
function show(name, date, { scroll = true, sex } = {}) {
  if (sex) setGender(sex);
  const m = calcMatrix(date);
  current = { name, date, m, g: gender };
  $('resultTitle').textContent = name ? `МАТРИЦА: ${name.toUpperCase()}` : 'ТВОЯ МАТРИЦА';
  $('resultDate').textContent = formatDate(date);
  drawChart(m);
  $('pointInfo').innerHTML = 'Нажми на любое число в схеме, чтобы узнать, что оно значит';
  renderCards(m);
  $('result').hidden = false;

  const params = new URLSearchParams({ d: formatDate(date) });
  if (name) params.set('n', name);
  if (gender !== 'n') params.set('g', gender);
  history.replaceState(null, '', '#' + params.toString());

  if (scroll) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const date = parseDate(dateInput.value);
  if (!date) {
    showError(dateInput.value ? 'Проверь дату: нужен формат ДД.ММ.ГГГГ, например 15.03.1995' : 'Введи дату рождения');
    dateInput.focus();
    return;
  }
  show($('name').value.trim(), date, { sex: readGender() });
});

// ── Сохранить / поделиться ─────────────────────────
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

$('saveBtn').addEventListener('click', () => {
  if (!current) return;
  const list = loadSaved();
  const d = formatDate(current.date);
  if (list.some((x) => x.d === d && x.n === current.name && (x.g || 'n') === current.g)) { toast('Эта матрица уже сохранена'); return; }
  list.unshift({ d, n: current.name, g: current.g, at: Date.now() });
  if (storeSaved(list)) { updateBadge(); toast('Сохранено в «Мои матрицы»'); }
  else toast('Не получилось сохранить: браузер запрещает хранилище');
});

$('shareBtn').addEventListener('click', async () => {
  if (!current) return;
  const url = location.href;
  const who = current.name ? `${current.name}: ` : '';
  const text = `${who}центр матрицы — ${arc(current.m.E).name}. Посмотри свою в «Аркане»`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Аркана — матрица судьбы', text, url }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); }
  catch { prompt('Скопируй ссылку:', url); }
});

// ── Мои матрицы ────────────────────────────────────
const dialog = $('savedDialog');

function renderSaved() {
  const list = loadSaved();
  $('savedEmpty').hidden = list.length > 0;
  $('savedList').innerHTML = list.map((x, i) => {
    const date = parseDate(x.d);
    const e = date ? calcMatrix(date).E : null;
    return `<li>
      <button class="saved-open" data-i="${i}"><b>${esc(x.n || 'Без имени')}</b><span>${esc(x.d)}${e ? ' · ' + esc(arc(e).name) : ''}</span></button>
      <button class="saved-del" data-i="${i}" aria-label="Удалить ${esc(x.n || x.d)}">✕</button>
    </li>`;
  }).join('');
}

$('savedBtn').addEventListener('click', () => { renderSaved(); dialog.showModal(); });
$('closeSaved').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

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
  const date = item && parseDate(item.d);
  if (!date) return;
  dialog.close();
  $('name').value = item.n || '';
  dateInput.value = item.d;
  show(item.n || '', date, { sex: item.g || 'n' });
});

// ── Старт: открыть матрицу из ссылки ───────────────
function fromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const date = parseDate(params.get('d'));
  if (!date) return;
  const name = (params.get('n') || '').slice(0, 40);
  $('name').value = name;
  dateInput.value = formatDate(date);
  show(name, date, { scroll: true, sex: params.get('g') || 'n' });
}

updateBadge();
fromHash();
