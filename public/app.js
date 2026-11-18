'use strict';

const REFRESH_MS = 5 * 60 * 1000; // Daten alle 5 Minuten
const RELOAD_MS = 6 * 60 * 60 * 1000; // Seite alle 6 h komplett neu laden

Chart.defaults.color = '#8b9bb4';
Chart.defaults.borderColor = '#1f2a44';
Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.animation = false;
Chart.defaults.plugins.legend.labels.boxWidth = 12;

const charts = {};

function el(id) {
  return document.getElementById(id);
}

function fmtNum(n) {
  return n === null || n === undefined ? '–' : n.toLocaleString('de-DE');
}

function fmtNum1(n) {
  return n === null || n === undefined ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

/*
 * CERT-Bund-Titel tragen vorangestellte Klammer-Token in wechselnder
 * Reihenfolge, z. B. "[NEU] [UNGEPATCHT] [hoch] OpenSSL: …".
 * Risikoklasse wird zum Bullet, NEU/UPDATE zur Zeilen-Einfärbung,
 * UNGEPATCHT zum roten Ring um den Bullet.
 */
const SEVERITY_TOKENS = ['kritisch', 'hoch', 'mittel', 'niedrig'];
function parseCertTitle(title) {
  let status = null;
  let severity = null;
  let unpatched = false;
  let text = (title || '').trim();
  let m;
  while ((m = text.match(/^\[([^\]]+)\]\s*/))) {
    const token = m[1].trim().toLowerCase();
    if (token === 'neu') status = 'neu';
    else if (token === 'update') status = 'update';
    else if (token === 'ungepatcht') unpatched = true;
    else if (SEVERITY_TOKENS.includes(token)) severity = token;
    else break; // unbekanntes Token im Titel belassen
    text = text.slice(m[0].length);
  }
  return { status, severity, unpatched, text };
}

/** Wetter-Icon aus dem Titel einer DWD-Warnung ableiten */
function dwdIcon(headline) {
  const t = (headline || '').toUpperCase();
  if (/GEWITTER/.test(t)) return '⛈️';
  if (/ORKAN|STURM|WIND|BÖEN/.test(t)) return '💨';
  if (/SCHNEE/.test(t)) return '🌨️';
  if (/GLÄTTE|GLATTEIS|FROST/.test(t)) return '🧊';
  if (/REGEN/.test(t)) return '🌧️';
  if (/HITZE/.test(t)) return '🌡️';
  if (/UV/.test(t)) return '☀️';
  if (/NEBEL/.test(t)) return '🌫️';
  if (/HOCHWASSER|FLUT/.test(t)) return '🌊';
  if (/TAUWETTER/.test(t)) return '💧';
  return '⚠️';
}

/** BrightSky-/DWD-Wetterzustand -> Icon und deutsche Beschreibung */
const WEATHER_ICONS = {
  'clear-day': ['☀️', 'Klar'],
  'clear-night': ['🌙', 'Klar'],
  'partly-cloudy-day': ['⛅', 'Teils bewölkt'],
  'partly-cloudy-night': ['☁️', 'Teils bewölkt'],
  cloudy: ['☁️', 'Bedeckt'],
  fog: ['🌫️', 'Nebel'],
  wind: ['💨', 'Windig'],
  rain: ['🌧️', 'Regen'],
  sleet: ['🌨️', 'Schneeregen'],
  snow: ['🌨️', 'Schnee'],
  hail: ['🌨️', 'Hagel'],
  thunderstorm: ['⛈️', 'Gewitter'],
  dry: ['🌡️', 'Trocken'],
};

const POLLEN_LEVELS = ['keine', 'gering', 'mittel', 'hoch'];
function pollenText(level) {
  if (level <= 0) return 'keine';
  const lower = POLLEN_LEVELS[Math.floor(level)] || 'hoch';
  const upper = POLLEN_LEVELS[Math.ceil(level)] || 'hoch';
  return lower === upper ? lower : `${lower}–${upper}`;
}

function windCompass(deg) {
  if (deg === null || deg === undefined) return '';
  return ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
}

function renderWeather(w) {
  el('weather').classList.toggle('hidden', !w || w.temp === null);
  if (!w || w.temp === null) return;
  const [icon, label] = WEATHER_ICONS[w.icon] || ['🌡️', ''];
  const deg = (v) => (v === null || v === undefined ? '–' : `${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })}°`);
  const hhmm = (iso) =>
    iso ? new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
  el('weather-icon').textContent = icon;
  el('weather-temp').textContent = deg(w.temp);
  el('weather-desc').textContent = `${label ? label + ' · ' : ''}Berlin`;
  el('weather').title = w.station
    ? `DWD-Station ${w.station} (via BrightSky) · UV & Pollen: DWD`
    : 'DWD/BrightSky';
  const pollen = w.pollen
    ? w.pollen.top.length
      ? `${esc(w.pollen.top[0].type)} ${pollenText(w.pollen.top[0].level)}`
      : 'keine'
    : '–';
  const pollenTitle = w.pollen?.top
    ?.map((p) => `${p.type}: ${pollenText(p.level)}`)
    .join(', ');
  const item = (l, v, title) =>
    `<div class="wd-item"${title ? ` title="${esc(title)}"` : ''}><span class="wd-label">${l}</span><span class="wd-value">${v}</span></div>`;
  el('weather-details').innerHTML =
    item('Gefühlt', deg(w.feels)) +
    item('Wind', `${Math.round(w.windKmh ?? 0)} km/h ${windCompass(w.windDir)}`) +
    item('Regen', `${(w.precip ?? 0).toLocaleString('de-DE')} mm/h`) +
    item('UV-Index', w.uv ?? '–') +
    item('Pollen', pollen, pollenTitle) +
    item('Sonne', `${hhmm(w.sunrise)}-${hhmm(w.sunset)}`);
}

/* Bevölkerungsschutz-Meldungen rollieren im Live-Segment durch */
let civilItems = [];
let civilIdx = 0;
let civilTimer = null;

function showCivilItem() {
  const target = el('civil-status');
  if (civilItems === null) {
    target.innerHTML = '<span class="empty-note">Bevölkerungsschutz: Quelle derzeit nicht erreichbar</span>';
    return;
  }
  if (civilItems.length === 0) {
    target.innerHTML = '<span class="svc-dot svc-ok"></span><span>keine aktiven Meldungen</span>';
    return;
  }
  const SEV_DOTS = { Extreme: 'svc-critical', Severe: 'svc-major', Moderate: 'svc-minor', Minor: 'svc-minor' };
  const it = civilItems[civilIdx % civilItems.length];
  const counter = civilItems.length > 1 ? ` · ${(civilIdx % civilItems.length) + 1}/${civilItems.length}` : '';
  target.classList.remove('civil-in');
  void target.offsetWidth; // Animation neu starten
  target.classList.add('civil-in');
  target.innerHTML =
    `<span class="svc-dot ${SEV_DOTS[it.severity] || 'svc-minor'}"></span>` +
    `<span class="civil-title">${esc(it.title)}</span>` +
    `<span class="item-meta">${esc(it.provider || '')}${counter}</span>`;
  civilIdx++;
}

function startCivilRotation(items) {
  civilItems = items === null || items === undefined ? null : items;
  civilIdx = 0;
  clearInterval(civilTimer);
  showCivilItem();
  if (civilItems && civilItems.length > 1) civilTimer = setInterval(showCivilItem, 7000);
}

function meta(parts) {
  const text = parts.filter(Boolean).join(' · ');
  return `<span class="item-meta">${text}</span>`;
}

function fmtCount(n) {
  if (n === null || n === undefined) return '';
  return n >= 1000 ? (n / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + 'k' : String(n);
}

/*
 * Feed-Panel rendern; läuft der Inhalt über, scrollt er langsam in einer
 * Endlosschleife (Inhalt wird dafür dupliziert).
 */
const SCROLL_SPEED = 8; // Pixel pro Sekunde – reduziert für Pi 3B

function renderList(id, items, render) {
  const container = el(id);
  container.classList.remove('scrolling');
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="nitem empty-note">Quelle derzeit nicht erreichbar</div>';
    return;
  }
  container.innerHTML = `<div class="ntrack">${items.map(render).join('')}</div>`;
  requestAnimationFrame(() => {
    const track = container.querySelector('.ntrack');
    if (!track || track.scrollHeight <= container.clientHeight + 4) return;
    track.innerHTML += track.innerHTML;
    const dur = Math.round(track.scrollHeight / 2 / SCROLL_SPEED);
    track.style.setProperty('--scroll-duration', `${dur}s`);
    track.style.transform = 'translateZ(0)';
    container.classList.add('scrolling');
  });
}

function esc(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

/* ── Diagramme ─────────────────────────────────────────────── */

const COLORS = {
  accent: '#38bdf8',
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
  violet: '#a78bfa',
  panel: '#121a2e',
  text: '#e6ecf5',
};

/** Diagramm anlegen oder mit neuen Daten aktualisieren (Instanz bleibt bestehen). */
function upsertChart(key, canvasId, cfg) {
  if (charts[key]) {
    charts[key].data = cfg.data;
    charts[key].options = cfg.options;
    charts[key].update();
  } else {
    charts[key] = new Chart(el(canvasId), cfg);
  }
}

/** Platzhaltertext einblenden, wenn ein Diagramm keine Daten hat. */
function setEmpty(id, isEmpty) {
  el(id).classList.toggle('hidden', !isEmpty);
}

/** Kalenderwoche nach ISO 8601 für ein Datum YYYY-MM-DD */
function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

const weekLabel = (dateStr) => `KW ${isoWeek(dateStr)}`;

/** Enddatum (TT.MM.) eines 7-Tage-Zeitraums, der am Datum beginnt */
function endLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function renderCveTrendChart(weekly) {
  const has = Array.isArray(weekly) && weekly.length > 0;
  setEmpty('empty-cvetrend', !has);
  if (!has) return;
  const last = weekly.length - 1;
  upsertChart('cvetrend', 'chart-cvetrend', {
    type: 'bar',
    data: {
      labels: weekly.map((w, i) => (i === last ? 'aktuell' : `bis ${endLabel(w.weekStart)}`)),
      datasets: [
        {
          label: 'Kritische Schwachstellen',
          data: weekly.map((w) => w.critical),
          backgroundColor: weekly.map((_, i) => (i === last ? COLORS.critical : '#7f2a2a')),
          borderRadius: 4,
          maxBarThickness: 64,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Anzahl' } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderKevWeeklyChart(weekly) {
  const has = Array.isArray(weekly) && weekly.length > 0;
  setEmpty('empty-kevweek', !has);
  if (!has) return;
  const top = Math.max(...weekly.map((w) => Math.max(w.kev, w.avg4))) + 1;
  upsertChart('kevweek', 'chart-kevweek', {
    type: 'bar',
    data: {
      labels: weekly.map((w) => weekLabel(w.weekStart)),
      datasets: [
        {
          type: 'line',
          label: 'Durchschnitt 4 Wochen',
          data: weekly.map((w) => w.avg4),
          yAxisID: 'y2',
          borderColor: COLORS.text,
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 0,
          tension: 0.3,
          order: 0,
        },
        {
          label: 'Ohne Ransomware-Bezug',
          data: weekly.map((w) => w.kev - w.ransomware),
          backgroundColor: COLORS.high,
          stack: 'kev',
          borderRadius: 2,
          order: 1,
        },
        {
          label: 'Mit Ransomware-Bezug',
          data: weekly.map((w) => w.ransomware),
          backgroundColor: COLORS.critical,
          stack: 'kev',
          borderRadius: 2,
          order: 1,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { stacked: true, beginAtZero: true, max: top, ticks: { precision: 0 } },
        y2: { display: false, beginAtZero: true, max: top },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderTteChart(zdc) {
  const years = zdc?.tteByYear || [];
  const has = years.length >= 2;
  setEmpty('empty-tte', !has);
  const foot = el('tte-foot');
  if (zdc) {
    foot.innerHTML =
      `<span>Aktuell: <b>${fmtNum1(zdc.medianTteDays)}</b> Tage (Median)</span>` +
      `<span><b>${fmtNum1(zdc.zeroDayRatePct)}&thinsp;%</b> am Tag der Veröffentlichung ausgenutzt</span>`;
  } else {
    foot.innerHTML = '';
  }
  if (!has) return;
  upsertChart('tte', 'chart-tte', {
    type: 'line',
    data: {
      labels: years.map((y) => String(y.year)),
      datasets: [
        {
          label: 'Median in Tagen',
          data: years.map((y) => y.medianDays),
          borderColor: COLORS.medium,
          backgroundColor: 'rgba(234,179,8,0.15)',
          fill: true,
          borderWidth: 3,
          pointRadius: 4,
          tension: 0.3,
          yAxisID: 'y',
        },
        {
          label: 'Anteil sofort ausgenutzt in %',
          data: years.map((y) => y.zeroDayRatePct),
          borderColor: COLORS.critical,
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Tage', color: COLORS.medium }, ticks: { color: COLORS.medium } },
        y1: {
          beginAtZero: true,
          max: 100,
          position: 'right',
          grid: { drawOnChartArea: false },
          title: { display: true, text: '% sofort', color: COLORS.critical },
          ticks: { color: COLORS.critical },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderVendorChart(vendors) {
  const has = Array.isArray(vendors) && vendors.length > 0;
  setEmpty('empty-vendors', !has);
  if (!has) return;
  upsertChart('vendors', 'chart-vendors', {
    type: 'bar',
    data: {
      labels: vendors.map((v) => v.vendor),
      datasets: [
        {
          label: 'Aktiv ausgenutzte Schwachstellen',
          data: vendors.map((v) => v.count),
          backgroundColor: COLORS.critical,
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderRegulationChart(topics) {
  const has = Array.isArray(topics) && topics.length > 0;
  setEmpty('empty-reg', !has);
  if (!has) return;
  upsertChart('reg', 'chart-reg', {
    type: 'bar',
    data: {
      labels: topics.map((t) => t.topic),
      datasets: [
        {
          label: 'Meldungen',
          data: topics.map((t) => t.count),
          backgroundColor: COLORS.accent,
          borderRadius: 3,
          barThickness: 14,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderEnergyChart(energy) {
  const hist = energy?.history || [];
  const has = hist.length >= 2;
  setEmpty('empty-energy', !has);
  if (!has) return;
  upsertChart('energy', 'chart-energy', {
    type: 'line',
    data: {
      labels: hist.map((p) =>
        new Date(p.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      ),
      datasets: [
        {
          label: 'Anteil erneuerbar in %',
          data: hist.map((p) => p.v),
          borderColor: COLORS.low,
          backgroundColor: 'rgba(34,197,94,0.15)',
          fill: true,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 4, maxRotation: 0, font: { size: 10 } } },
        y: { min: 0, max: 100, ticks: { stepSize: 50, font: { size: 10 } } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderDdosChart(cf) {
  const series = cf && !cf.unavailable ? cf.ddosSeries : null;
  const has = Array.isArray(series) && series.length >= 2;
  setEmpty('empty-ddos', !has);
  if (!has) return;
  upsertChart('ddos', 'chart-ddos', {
    type: 'line',
    data: {
      labels: series.map((_, i) => (i === series.length - 1 ? 'heute' : `-${series.length - 1 - i} T`)),
      datasets: [
        {
          label: 'Angriffsvolumen (relativ)',
          data: series,
          borderColor: COLORS.high,
          backgroundColor: 'rgba(249,115,22,0.15)',
          fill: true,
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.3,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, font: { size: 10 } } },
        y: { beginAtZero: true, ticks: { maxTicksLimit: 3, font: { size: 10 } } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

/* ── Kennzahlen und Veränderung zur Vorwoche ──────────────── */

/**
 * Pfeil und Veränderung zur Vorperiode. Bei Risikokennzahlen ist ein
 * Anstieg ungünstig (rot/orange), ein Rückgang günstig (grün).
 */
function setDelta(id, now, prev, unit) {
  const target = el(id);
  target.className = 'delta';
  if (now === null || now === undefined || prev === null || prev === undefined) {
    target.textContent = '';
    return;
  }
  const diff = now - prev;
  if (diff === 0) {
    target.textContent = `→ unverändert (${unit})`;
    return;
  }
  target.classList.add(diff > 0 ? 'worse' : 'better');
  const pct = prev > 0 ? ` (${diff > 0 ? '+' : ''}${Math.round((diff / prev) * 100)} %)` : '';
  target.textContent = `${diff > 0 ? '▲' : '▼'} ${diff > 0 ? '+' : ''}${diff.toLocaleString('de-DE')} ggü. ${unit}${pct}`;
}

/* ── Rendern ───────────────────────────────────────────────── */

function render(data) {
  el('demo-banner').classList.toggle('hidden', !data.demo);

  const tb = el('threat-badge');
  tb.className = `threat-badge level-${data.threatLevel.level}`;
  el('threat-value').textContent = data.threatLevel.label;
  tb.title = data.threatLevel.reason;

  // Kennzahlen
  el('kpi-cve-critical').textContent = fmtNum(data.kpis.cveCritical7d);
  el('kpi-kev7').textContent = fmtNum(data.kpis.kev7d);
  el('kpi-ransom').textContent = fmtNum(data.kpis.ransomwareKev30d);
  const prev = data.kpiPrev || {};
  setDelta('delta-cve-critical', data.kpis.cveCritical7d, prev.cveCritical7d, 'Vorwoche');
  setDelta('delta-kev7', data.kpis.kev7d, prev.kev7d, 'Vorwoche');
  setDelta('delta-ransom', data.kpis.ransomwareKev30d, prev.ransomwareKev30d, 'Vormonat');

  const zdc = data.lists.zeroDayClock;
  el('kpi-tte').textContent = zdc ? fmtNum1(zdc.medianTteDays) : '–';
  const years = zdc?.tteByYear || [];
  const deltaTte = el('delta-tte');
  deltaTte.className = 'delta';
  if (years.length >= 2) {
    const first = years[0];
    const last = years[years.length - 1];
    deltaTte.classList.add(last.medianDays < first.medianDays ? 'worse' : 'better');
    deltaTte.textContent = `${last.medianDays < first.medianDays ? '▼' : '▲'} von ${fmtNum1(first.medianDays)} Tagen (${first.year})`;
  } else {
    deltaTte.textContent = '';
  }

  const svcSummary = data.lists.serviceSummary;
  const ops = el('kpi-ops');
  if (svcSummary && svcSummary.known > 0) {
    ops.textContent = `${svcSummary.disrupted}/${svcSummary.known}`;
    ops.parentElement.classList.toggle('has-issue', svcSummary.disrupted > 0);
    el('kpi-ops-sub').textContent = 'beobachtete Cloud- und KI-Dienste';
    const d = el('delta-ops');
    d.className = `delta ${svcSummary.disrupted > 0 ? 'worse' : 'better'}`;
    d.textContent = svcSummary.disrupted > 0 ? svcSummary.names.join(', ') : 'alle Dienste normal';
  } else {
    ops.textContent = '–';
    el('delta-ops').textContent = '';
  }

  // Management-Zusammenfassung
  const summary = data.summary;
  el('summary-panel').className = `panel summary-panel area-summary level-${data.threatLevel.level}`;
  if (summary) {
    el('summary-headline').textContent = summary.headline;
    el('summary-list').innerHTML = summary.bullets.map((b) => `<li>${esc(b)}</li>`).join('');
    el('summary-action').textContent = summary.action;
  }

  // Diagramme
  renderCveTrendChart(data.charts.cveWeeklyCritical);
  renderKevWeeklyChart(data.charts.kevWeekly);
  renderTteChart(zdc);
  renderVendorChart(data.charts.kevTopVendors);
  renderRegulationChart(data.charts.regulationTopics);

  // Regulierung und Fristen
  renderList('list-reg', data.lists.regulation, (it) =>
    `<div class="nitem"><div class="item-body"><span class="topic-tag">${esc(it.topic)}</span><span class="item-title">${esc(it.title)}</span>${meta([esc(it.source), fmtTime(it.date)])}</div></div>`
  );
  renderList('list-deadlines', data.lists.deadlines, (d) => {
    const months = d.daysLeft >= 120 ? Math.round(d.daysLeft / 30.4) : null;
    const big = months !== null ? months : d.daysLeft;
    const unit = months !== null ? 'Monate' : 'Tage';
    const date = new Date(d.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `<div class="nitem deadline"><div class="deadline-days${d.daysLeft <= 90 ? ' soon' : ''}">${big}<small>${unit}</small></div><div class="deadline-text">${esc(d.title)}<span class="item-meta">${date} · ${esc(d.note)}</span></div></div>`;
  });

  // Detailmeldungen
  const certList = data.lists.certBund;
  el('certbund-sub').textContent = data.kpis.certBund7d !== null ? `${fmtNum(data.kpis.certBund7d)} in 7 Tagen` : '';
  renderList('list-certbund', certList, (it) => {
    const { status, severity, unpatched, text } = parseCertTitle(it.title);
    const dot = `<span class="dot ${severity ? `dot-${severity}` : ''}${unpatched ? ' unpatched' : ''}" title="${[severity, unpatched ? 'ungepatcht' : ''].filter(Boolean).join(', ')}"></span>`;
    return `<div class="nitem ${status === 'update' ? 'item-update' : 'item-new'}">${dot}<div class="item-body"><span class="item-title">${esc(text)}</span>${meta([fmtTime(it.date)])}</div></div>`;
  });

  const byDate = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);
  const news = [
    ...(data.lists.securityNews || []).slice(0, 8),
    ...(data.lists.aiNews || []).slice(0, 4).map((it) => ({ ...it, ki: true })),
    ...(data.lists.techNews || []).slice(0, 5),
  ].sort(byDate);
  renderList('list-news', news, (it) =>
    `<div class="nitem">${it.ki ? '<span class="dot dot-ki" title="KI"></span>' : ''}<div class="item-body"><span class="item-title">${esc(it.title)}</span>${meta([esc(it.source), fmtTime(it.date)])}</div></div>`
  );

  // Verfügbarkeit und Betrieb
  const SVC_DOTS = { none: 'svc-ok', minor: 'svc-minor', major: 'svc-major', critical: 'svc-critical' };
  el('svc-status').innerHTML = (data.lists.serviceStatus || [])
    .map(
      (s) =>
        `<span class="svc-card${s.indicator !== 'none' && s.indicator !== 'unknown' ? ' bad' : ''}" title="${esc(s.description)}"><span class="svc-dot ${SVC_DOTS[s.indicator] || 'svc-unknown'}"></span>${esc(s.name)}</span>`
    )
    .join('') || '<span class="empty-note">Quelle derzeit nicht erreichbar</span>';

  const dwd = data.lists.dwd;
  if (dwd && dwd.total > 0) {
    const DWD_DOTS = { Extreme: 'svc-critical', Severe: 'svc-major', Moderate: 'svc-minor', Minor: 'svc-ok' };
    const icons = [...new Set((dwd.events || []).map(dwdIcon))].join('');
    el('dwd-status').innerHTML =
      `<span class="svc-dot ${DWD_DOTS[dwd.worst] || 'svc-minor'}"></span>` +
      `<span>Wetterwarnungen: <span class="live-value">${fmtNum(dwd.total)}</span> aktiv</span>` +
      (dwd.severe > 0 ? `<span><span class="live-value">${fmtNum(dwd.severe)}</span> schwer</span>` : '') +
      (icons ? `<span class="dwd-icons" title="${esc((dwd.events || []).join('\n'))}">${icons}</span>` : '');
  } else if (dwd) {
    el('dwd-status').innerHTML = '<span class="svc-dot svc-ok"></span><span>keine Wetterwarnungen</span>';
  } else {
    el('dwd-status').innerHTML = '<span class="empty-note">Quelle derzeit nicht erreichbar</span>';
  }

  startCivilRotation(data.lists.civilProtection);
  renderWeather(data.lists.weather);

  const cf = data.lists.cloudflare;
  el('cloudflare-seg').classList.toggle('hidden', cf === null || cf === undefined);
  renderDdosChart(cf);
  if (cf && !cf.unavailable) {
    const dot = cf.outagesDe > 0 ? 'svc-critical' : cf.outages24h >= 15 ? 'svc-minor' : 'svc-ok';
    const ddos =
      cf.ddosTrendPct !== null && cf.ddosTrendPct !== undefined
        ? `<span title="Angriffsvolumen gegenüber 7-Tage-Schnitt">heute <b class="live-value">${cf.ddosTrendPct > 0 ? '+' : ''}${cf.ddosTrendPct}&thinsp;%</b></span>`
        : '';
    el('cloudflare-status').innerHTML =
      `<span class="svc-dot ${dot}"></span>` +
      `<span title="Gemeldete Internet-Ausfälle, letzte 24 h"><b class="live-value">${fmtNum(cf.outages24h)}</b> Ausfälle weltweit</span>` +
      `<span>DE <b class="live-value">${fmtNum(cf.outagesDe)}</b></span>` +
      ddos;
  } else if (cf) {
    el('cloudflare-status').innerHTML = '<span class="empty-note">Quelle derzeit nicht erreichbar</span>';
  }

  const energy = data.lists.energy;
  renderEnergyChart(energy);
  if (energy && energy.renShare !== null) {
    const AMPEL = { 0: 'svc-major', 1: 'svc-minor', 2: 'svc-ok', 3: 'svc-ok' };
    const load =
      energy.loadGw !== null && energy.loadGw !== undefined
        ? `<span title="Aktuelle Netzlast">Last <b class="live-value">${energy.loadGw.toLocaleString('de-DE', { maximumFractionDigits: 1 })}</b> GW</span>`
        : '';
    el('energy-status').innerHTML =
      `<span class="svc-dot ${AMPEL[energy.signal] ?? 'svc-unknown'}" title="Strom-Ampel"></span>` +
      `<span>jetzt <b class="live-value">${Math.round(energy.renShare)}&thinsp;%</b></span>` +
      load;
  } else {
    el('energy-status').innerHTML = '<span class="empty-note">Quelle derzeit nicht erreichbar</span>';
  }

  // Social-Trends (laufendes Band)
  const chipsHtml = (data.lists.socialTrends || []).map((t) => {
    const count = t.count ? `<span class="chip-count">${fmtCount(t.count)}</span>` : '';
    const prefix = t.source === 'Bluesky' ? '' : '#';
    const cls = [t.source === 'Bluesky' ? 'chip-bsky' : '', t.cto ? 'chip-cto' : 'chip-dim']
      .join(' ').trim();
    return `<span class="chip ${cls}" title="${esc(t.source)}"><span class="chip-tag">${prefix}${esc(t.tag)}</span>${count}</span>`;
  }).join('') || '<span class="empty-note">Keine Trend-Daten verfügbar</span>';

  const trendChips = el('trend-chips');
  trendChips.classList.remove('scrolling');
  trendChips.innerHTML = `<div class="trend-track">${chipsHtml}</div>`;
  requestAnimationFrame(() => {
    const track = trendChips.querySelector('.trend-track');
    if (!track || track.scrollWidth <= trendChips.clientWidth + 4) return;
    track.innerHTML += track.innerHTML; // duplizieren für nahtlose Schleife
    const dur = Math.round(track.scrollWidth / 2 / 35); // ~35 px/s = langsam
    track.style.setProperty('--trend-duration', `${dur}s`);
    track.style.transform = 'translateZ(0)';
    trendChips.classList.add('scrolling');
  });

  const tickerItems = [
    ...(data.lists.hackerNews || []).map(
      (it) => `<span><span class="score">▲ ${it.score}</span>${esc(it.title)}</span>`
    ),
    ...(data.lists.euAdvisories || []).map(
      (it) => `<span><span class="score">CERT-EU</span>${esc(it.title)}</span>`
    ),
  ];
  el('ticker-track').innerHTML = tickerItems.join('') || '<span class="empty-note">Keine Ticker-Daten</span>';

  el('updated').textContent = new Date(data.generatedAt).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const ok = data.sources.filter((s) => s.ok).length;
  const health = el('source-health');
  health.textContent = `${ok}/${data.sources.length}`;
  health.className = ok < data.sources.length ? 'stale' : '';
}

/* Dünner Fortschrittsbalken am oberen Rand bis zum nächsten Refresh */
function restartProgress() {
  const bar = el('refresh-progress');
  bar.style.animation = 'none';
  void bar.offsetWidth; // Animation zurücksetzen
  bar.style.animation = `refresh-progress ${REFRESH_MS}ms linear forwards`;
}

let lastSuccess = Date.now();
let retryScheduled = false;

async function refresh() {
  restartProgress();
  try {
    // Cache-Buster: eindeutige URL je Abruf, damit weder CDN noch Proxys
    // eine alte Antwort ausliefern können.
    const res = await fetch(`/api/dashboard?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data);
    lastSuccess = Date.now();
  } catch (err) {
    console.error('Aktualisierung fehlgeschlagen:', err);
    el('updated').innerHTML =
      '<span class="stale">Aktualisierung fehlgeschlagen – neuer Versuch in 60 s</span>';
    if (!retryScheduled) {
      retryScheduled = true;
      setTimeout(() => {
        retryScheduled = false;
        refresh();
      }, 60 * 1000);
    }
  }
}

// Selbstheilung: gelingt 30 Minuten lang kein Refresh, lädt die Seite neu
setInterval(() => {
  if (Date.now() - lastSuccess > 30 * 60 * 1000) location.reload();
}, 60 * 1000);

function tickClock() {
  const now = new Date();
  el('clock').textContent = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  el('date').textContent = now.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

tickClock();
setInterval(tickClock, 1000);
refresh();
setInterval(refresh, REFRESH_MS);
setTimeout(() => location.reload(), RELOAD_MS);
