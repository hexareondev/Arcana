// Общие поля формы для натальных карт: время рождения и место (поиск Open-Meteo + ручной ввод).
import { isValidZone } from './natal.js?v=12';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Время ──────────────────────────────────────────
export function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const hour = Number(m[1]), minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}
export const fmtTime = ({ hour, minute }) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

export function fieldError(input, msg) {
  const el = input.closest('.field').querySelector('.error');
  if (!msg) { el.hidden = true; input.removeAttribute('aria-invalid'); return; }
  el.textContent = msg; el.hidden = false; input.setAttribute('aria-invalid', 'true');
}

/** Разметка блока «дата + время + место» для человека с префиксом id. */
export function personFieldsHTML(p, { withName = true, namePlaceholder = 'Например, Аня' } = {}) {
  return `
    ${withName ? `<div class="field">
      <label for="${p}Name">Имя <span class="muted">(необязательно)</span></label>
      <input id="${p}Name" type="text" maxlength="40" autocomplete="off" placeholder="${namePlaceholder}">
    </div>` : ''}
    <div class="field">
      <label for="${p}Date">Дата рождения</label>
      <input id="${p}Date" class="date-input" type="text" inputmode="numeric" maxlength="10" placeholder="ДД.ММ.ГГГГ" required>
      <p class="error" role="alert" hidden></p>
    </div>
    <div class="field">
      <label for="${p}Time">Время рождения</label>
      <input id="${p}Time" class="time-input" type="text" inputmode="numeric" maxlength="5" placeholder="ЧЧ:ММ">
      <p class="error" role="alert" hidden></p>
      <label class="check"><input type="checkbox" id="${p}NoTime"><span>Не знаю точное время</span></label>
    </div>
    <div class="field place-field">
      <label for="${p}Place">Место рождения</label>
      <div class="combo">
        <input id="${p}Place" type="text" maxlength="80" placeholder="Начни вводить город" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${p}PlaceList" autocomplete="off">
        <ul class="place-list" id="${p}PlaceList" role="listbox" hidden></ul>
      </div>
      <p class="place-picked" id="${p}Picked" hidden></p>
      <p class="error" role="alert" hidden></p>
      <button type="button" class="link-btn" id="${p}ManualToggle">Ввести координаты вручную</button>
    </div>
    <div class="manual" id="${p}Manual" hidden>
      <div class="manual-row">
        <div class="field"><label for="${p}Lat">Широта</label><input id="${p}Lat" type="text" inputmode="decimal" placeholder="55.03"></div>
        <div class="field"><label for="${p}Lon">Долгота</label><input id="${p}Lon" type="text" inputmode="decimal" placeholder="82.92"></div>
      </div>
      <div class="field">
        <label for="${p}Zone">Часовой пояс</label>
        <input id="${p}Zone" type="text" list="zoneList" placeholder="Asia/Novosibirsk или UTC+07:00">
      </div>
      <p class="muted small">Северная широта и восточная долгота — со знаком «+», южная и западная — со знаком «−».</p>
    </div>`;
}

function fillZones() {
  const dl = document.getElementById('zoneList');
  if (!dl || dl.children.length) return;
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { /* старый браузер */ }
  const fixed = [];
  for (let h = -12; h <= 14; h++) fixed.push(`UTC${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`);
  dl.innerHTML = [...zones, ...fixed].map((z) => `<option value="${z}">`).join('');
}

async function searchPlaces(q, signal) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=ru&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return (data.results || []).filter((r) => r.timezone).map((r) => ({
    name: r.name,
    label: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : '', r.country].filter(Boolean).join(', '),
    lat: r.latitude, lon: r.longitude, zone: r.timezone,
  }));
}

/**
 * Подключает поля человека с префиксом p. Возвращает объект:
 *   read() → { date, time, place, name } или { error, focus }
 *   fill({ name, date, time, place })
 */
export function attachPerson(p, { parseDate, formatDate }) {
  const $ = (id) => document.getElementById(p + id);
  const input = $('Place'), list = $('PlaceList');
  let place = null, results = [], activeIdx = -1, timer = null, abort = null;

  const showPicked = () => {
    const el = $('Picked');
    if (!place) { el.hidden = true; return; }
    el.textContent = `${place.label || place.name} · ${place.lat.toFixed(2)}°, ${place.lon.toFixed(2)}° · ${place.zone}`;
    el.hidden = false;
  };
  const render = () => {
    if (!results.length) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); return; }
    list.innerHTML = results.map((r, i) => `<li role="option" id="${p}pl${i}" class="${i === activeIdx ? 'active' : ''}" aria-selected="${i === activeIdx}" data-i="${i}">
      <b>${esc(r.name)}</b><span>${esc(r.label.split(', ').slice(1).join(', '))}</span></li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (activeIdx >= 0) input.setAttribute('aria-activedescendant', `${p}pl${activeIdx}`);
  };
  const pick = (r) => {
    place = r; input.value = r.name;
    results = []; activeIdx = -1; render(); showPicked(); fieldError(input, '');
  };
  const openManual = (force) => {
    const box = $('Manual');
    const open = force === true ? true : box.hidden;
    box.hidden = !open;
    $('ManualToggle').textContent = open ? 'Скрыть ручной ввод' : 'Ввести координаты вручную';
    if (open) fillZones();
  };

  input.addEventListener('input', () => {
    place = null; showPicked();
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) { results = []; render(); return; }
    timer = setTimeout(async () => {
      if (abort) abort.abort();
      abort = new AbortController();
      try {
        results = await searchPlaces(q, abort.signal);
        activeIdx = results.length ? 0 : -1;
        render();
        fieldError(input, results.length ? '' : 'Ничего не нашлось. Попробуй иначе или введи координаты вручную.');
      } catch (err) {
        if (err.name === 'AbortError') return;
        fieldError(input, 'Поиск городов сейчас недоступен — введи координаты вручную.');
        openManual(true);
      }
    }, 350);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = (activeIdx + 1) % results.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = (activeIdx - 1 + results.length) % results.length; render(); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pick(results[activeIdx]); }
    else if (e.key === 'Escape') { results = []; render(); }
  });
  input.addEventListener('blur', () => setTimeout(() => { results = []; render(); }, 150));
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li');
    if (li) { e.preventDefault(); pick(results[Number(li.dataset.i)]); }
  });
  $('ManualToggle').addEventListener('click', () => openManual());

  const dateEl = $('Date');
  dateEl.addEventListener('input', () => {
    const digits = dateEl.value.replace(/\D/g, '').slice(0, 8);
    let out = digits.slice(0, 2);
    if (digits.length > 2) out += '.' + digits.slice(2, 4);
    if (digits.length > 4) out += '.' + digits.slice(4, 8);
    dateEl.value = out;
    fieldError(dateEl, '');
  });

  const time = $('Time');
  time.addEventListener('input', () => {
    const digits = time.value.replace(/\D/g, '').slice(0, 4);
    time.value = digits.length > 2 ? digits.slice(0, 2) + ':' + digits.slice(2) : digits;
    fieldError(time, '');
  });
  $('NoTime').addEventListener('change', () => {
    time.disabled = $('NoTime').checked;
    if (time.disabled) fieldError(time, '');
  });

  const readManual = () => {
    const num = (v) => Number(String(v).replace(',', '.').replace('−', '-').trim());
    const la = $('Lat').value.trim(), lo = $('Lon').value.trim();
    const lat = num(la), lon = num(lo), zone = $('Zone').value.trim();
    if (!la || !lo || !isFinite(lat) || !isFinite(lon)) return { error: 'Укажи широту и долготу числами' };
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return { error: 'Широта от −90 до 90, долгота от −180 до 180' };
    if (!zone || !isValidZone(zone)) return { error: 'Укажи часовой пояс, например Asia/Novosibirsk или UTC+07:00' };
    const name = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    return { name, label: name, lat, lon, zone };
  };

  return {
    read() {
      const dateInput = $('Date');
      const date = parseDate(dateInput.value);
      if (!date) { fieldError(dateInput, dateInput.value ? 'Проверь дату: формат ДД.ММ.ГГГГ' : 'Введи дату рождения'); return { error: true, focus: dateInput }; }
      fieldError(dateInput, '');
      let t = null;
      if (!$('NoTime').checked) {
        t = parseTime(time.value);
        if (!t) { fieldError(time, time.value ? 'Проверь время: формат ЧЧ:ММ, например 14:30' : 'Введи время или отметь «Не знаю точное время»'); return { error: true, focus: time }; }
      }
      let pl = place;
      if (!$('Manual').hidden && (!pl || $('Lat').value.trim())) {
        const m = readManual();
        if (m.error) { fieldError(input, m.error); return { error: true, focus: $('Lat') }; }
        pl = m;
      }
      if (!pl) { fieldError(input, 'Выбери город из списка или введи координаты вручную'); return { error: true, focus: input }; }
      fieldError(input, '');
      const nameEl = $('Name');
      return { date, time: t, place: pl, name: nameEl ? nameEl.value.trim() : '' };
    },
    fill({ name = '', date, time: tm, place: pl }) {
      if ($('Name')) $('Name').value = name;
      $('Date').value = formatDate(date);
      $('Time').value = tm ? fmtTime(tm) : '';
      $('NoTime').checked = !tm;
      $('Time').disabled = !tm;
      place = pl;
      input.value = pl.name;
      showPicked();
    },
  };
}
