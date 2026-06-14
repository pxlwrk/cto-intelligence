'use strict';

const REFRESH_MS = 5 * 60 * 1000; // Daten alle 5 Minuten
const RELOAD_MS = 6 * 60 * 60 * 1000; // Seite alle 6 h komplett neu laden

const SEV_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
  NONE: '#64748b',
};
const SEV_LABELS = {
  CRITICAL: 'Kritisch',
  HIGH: 'Hoch',
  MEDIUM: 'Mittel',
  LOW: 'Niedrig',
  NONE: 'o. Bew.',
};

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
    item('Min/Max', `${deg(w.tmin)}/${deg(w.tmax)}`) +
    item('Wind', `${Math.round(w.windKmh ?? 0)} km/h ${windCompass(w.windDir)}`) +
    item('Böen', `${Math.round(w.gustKmh ?? 0)} km/h`) +
    item('Feuchte', `${Math.round(w.humidity ?? 0)} %`) +
    item('Druck', `${Math.round(w.pressure ?? 0)} hPa`) +
    item('Regen', `${(w.precip ?? 0).toLocaleString('de-DE')} mm/h`) +
    item('UV-Index', w.uv ?? '–') +
    item('Pollen', pollen, pollenTitle) +
    item('Sonne', `${hhmm(w.sunrise)}–${hhmm(w.sunset)}`);
}

/* Bevölkerungsschutz-Meldungen rollieren im Live-Segment durch */
let civilItems = [];
let civilIdx = 0;
let civilTimer = null;

function showCivilItem() {
  const target = el('civil-status');
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
  civilItems = items || [];
  civilIdx = 0;
  clearInterval(civilTimer);
  showCivilItem();
  if (civilItems.length > 1) civilTimer = setInterval(showCivilItem, 7000);
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

function renderSeverityChart(severities) {
  const ctx = el('chart-severity');
  const keys = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
  const data = severities ? keys.map((k) => severities[k] || 0) : [];
  const cfg = {
    type: 'doughnut',
    data: {
      labels: keys.map((k) => SEV_LABELS[k]),
      datasets: [
        {
          data,
          backgroundColor: keys.map((k) => SEV_COLORS[k]),
          borderColor: '#121a2e',
          borderWidth: 2,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: { legend: { position: 'right' } },
    },
  };
  if (charts.severity) {
    charts.severity.data = cfg.data;
    charts.severity.update();
  } else {
    charts.severity = new Chart(ctx, cfg);
  }
}

function renderTimelineChart(timeline) {
  const ctx = el('chart-timeline');
  const labels = (timeline || []).map((b) =>
    new Date(b.date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  );
  const cfg = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'CERT-Bund Advisories (linke Achse)',
          data: (timeline || []).map((b) => b.certBund),
          backgroundColor: '#38bdf8',
          borderRadius: 3,
          yAxisID: 'y',
        },
        {
          label: 'KEV-Neuzugänge (rechte Achse)',
          data: (timeline || []).map((b) => b.kev),
          backgroundColor: '#f97316',
          borderRadius: 3,
          yAxisID: 'yKev',
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, stacked: false },
        // Getrennte Y-Achsen: Advisories (zweistellig/Tag) und KEV (einstellig)
        // skalieren unabhängig, damit beide Reihen gut ablesbar sind.
        y: {
          beginAtZero: true,
          position: 'left',
          ticks: { precision: 0, color: '#38bdf8' },
        },
        yKev: {
          beginAtZero: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { precision: 0, color: '#f97316' },
        },
      },
      plugins: { legend: { position: 'top', align: 'end' } },
    },
  };
  if (charts.timeline) {
    charts.timeline.data = cfg.data;
    charts.timeline.update();
  } else {
    charts.timeline = new Chart(ctx, cfg);
  }
}

function renderVendorChart(vendors) {
  const ctx = el('chart-vendors');
  const cfg = {
    type: 'bar',
    data: {
      labels: (vendors || []).map((v) => v.vendor),
      datasets: [
        {
          label: 'Aktiv ausgenutzte Schwachstellen',
          data: (vendors || []).map((v) => v.count),
          backgroundColor: '#ef4444',
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
  };
  if (charts.vendors) {
    charts.vendors.data = cfg.data;
    charts.vendors.update();
  } else {
    charts.vendors = new Chart(ctx, cfg);
  }
}

function renderBcixChart(points) {
  const ctx = el('chart-bcix');
  const cfg = {
    type: 'line',
    data: {
      labels: points.map(() => ''),
      datasets: [{
        data: points,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56,189,248,0.15)',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { display: false },
        y: { display: false, beginAtZero: false },
      },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  };
  if (charts.bcix) {
    charts.bcix.data.datasets[0].data = points;
    charts.bcix.update();
  } else {
    charts.bcix = new Chart(ctx, cfg);
  }
}

/* ── Rendern ───────────────────────────────────────────────── */

function render(data) {
  el('demo-banner').classList.toggle('hidden', !data.demo);

  const tb = el('threat-badge');
  tb.className = `threat-badge level-${data.threatLevel.level}`;
  el('threat-value').textContent = data.threatLevel.label;
  tb.title = data.threatLevel.reason;

  el('kpi-cve-critical').textContent = fmtNum(data.kpis.cveCritical7d);
  el('kpi-cve-total').textContent = fmtNum(data.kpis.cveTotal7d);
  el('kpi-kev7').textContent = fmtNum(data.kpis.kev7d);
  el('kpi-kev30').textContent = fmtNum(data.kpis.kev30d);
  el('kpi-ransom').textContent = fmtNum(data.kpis.ransomwareKev30d);
  el('kpi-certbund').textContent = fmtNum(data.kpis.certBund7d);
  el('kpi-bsi').textContent = fmtNum(data.kpis.bsiCsw7d);

  renderSeverityChart(data.charts.cveSeverity);
  renderTimelineChart(data.charts.advisoryTimeline);
  renderVendorChart(data.charts.kevTopVendors);

  renderList('list-certbund', data.lists.certBund, (it) => {
    const { status, severity, unpatched, text } = parseCertTitle(it.title);
    const dot = `<span class="dot ${severity ? `dot-${severity}` : ''}${unpatched ? ' unpatched' : ''}" title="${[severity, unpatched ? 'ungepatcht' : ''].filter(Boolean).join(', ')}"></span>`;
    return `<div class="nitem ${status === 'update' ? 'item-update' : 'item-new'}">${dot}<div class="item-body"><span class="item-title">${esc(text)}</span>${meta([fmtTime(it.date)])}</div></div>`;
  });

  renderList('list-secnews', data.lists.securityNews, (it) =>
    `<div class="nitem"><div class="item-body"><span class="item-title">${esc(it.title)}</span>${meta([esc(it.source), fmtTime(it.date)])}</div></div>`
  );

  const byDate = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);
  const tech = [
    ...(data.lists.aiNews || []).slice(0, 4).map((it) => ({ ...it, ki: true })),
    ...(data.lists.techNews || []).slice(0, 6),
  ].sort(byDate);
  renderList('list-tech', tech, (it) =>
    `<div class="nitem">${it.ki ? '<span class="dot dot-ki" title="KI"></span>' : ''}<div class="item-body"><span class="item-title">${esc(it.title)}</span>${meta([esc(it.source), fmtTime(it.date)])}</div></div>`
  );

  const politics = [
    ...(data.lists.germany || []).slice(0, 5).map((it) => ({ ...it, region: 'DE' })),
    ...(data.lists.world || []).slice(0, 5).map((it) => ({ ...it, region: 'Welt' })),
  ].sort(byDate);
  renderList('list-politics', politics, (it) =>
    `<div class="nitem"><div class="item-body"><span class="item-title">${esc(it.title)}</span>${meta([it.region, fmtTime(it.date)])}</div></div>`
  );

  const SVC_DOTS = { none: 'svc-ok', minor: 'svc-minor', major: 'svc-major', critical: 'svc-critical' };
  el('svc-status').innerHTML = (data.lists.serviceStatus || [])
    .map(
      (s) =>
        `<span class="svc" title="${esc(s.description)}"><span class="svc-dot ${SVC_DOTS[s.indicator] || 'svc-unknown'}"></span>${esc(s.name)}</span>`
    )
    .join('') || '<span class="empty-note">Quelle derzeit nicht erreichbar</span>';

  const dwd = data.lists.dwd;
  if (dwd && dwd.total > 0) {
    const DWD_DOTS = { Extreme: 'svc-critical', Severe: 'svc-major', Moderate: 'svc-minor', Minor: 'svc-ok' };
    const icons = [...new Set((dwd.events || []).map(dwdIcon))].join('');
    el('dwd-status').innerHTML =
      `<span class="svc-dot ${DWD_DOTS[dwd.worst] || 'svc-minor'}"></span>` +
      `<span><span class="live-value">${fmtNum(dwd.total)}</span> aktiv</span>` +
      (dwd.severe > 0 ? `<span><span class="live-value">${fmtNum(dwd.severe)}</span> schwer</span>` : '') +
      (icons ? `<span class="dwd-icons" title="${esc((dwd.events || []).join('\n'))}">${icons}</span>` : '');
  } else if (dwd) {
    el('dwd-status').innerHTML = '<span class="svc-dot svc-ok"></span><span>keine Warnungen</span>';
  } else {
    el('dwd-status').innerHTML = '<span class="empty-note">Quelle derzeit nicht erreichbar</span>';
  }

  startCivilRotation(data.lists.civilProtection);
  renderWeather(data.lists.weather);

  const cf = data.lists.cloudflare;
  el('cloudflare-seg').classList.toggle('hidden', cf === null || cf === undefined);
  if (cf && !cf.unavailable) {
    const dot = cf.outagesDe > 0 ? 'svc-critical' : cf.outages24h >= 15 ? 'svc-minor' : 'svc-ok';
    const ddos =
      cf.ddosTrendPct !== null && cf.ddosTrendPct !== undefined
        ? `<span title="Layer-7-DDoS-Volumen gegenüber 7-Tage-Schnitt">DDoS <span class="live-value">${cf.ddosTrendPct > 0 ? '+' : ''}${cf.ddosTrendPct}&thinsp;%</span></span>`
        : '';
    el('cloudflare-status').innerHTML =
      `<span class="svc-dot ${dot}"></span>` +
      `<span title="Gemeldete Internet-Ausfälle, letzte 24 h"><span class="live-value">${fmtNum(cf.outages24h)}</span> Ausfälle</span>` +
      `<span>DE <span class="live-value">${fmtNum(cf.outagesDe)}</span></span>` +
      ddos;
  } else if (cf) {
    el('cloudflare-status').innerHTML = '<span class="empty-note">Quelle derzeit nicht erreichbar</span>';
  }

  const energy = data.lists.energy;
  if (energy && energy.renShare !== null) {
    const AMPEL = { 0: 'svc-major', 1: 'svc-minor', 2: 'svc-ok', 3: 'svc-ok' };
    const load =
      energy.loadGw !== null && energy.loadGw !== undefined
        ? `<span title="Aktuelle Netzlast">Last <span class="live-value">${energy.loadGw.toLocaleString('de-DE', { maximumFractionDigits: 1 })}</span> GW</span>`
        : '';
    el('energy-status').innerHTML =
      `<span class="svc-dot ${AMPEL[energy.signal] ?? 'svc-unknown'}" title="Strom-Ampel (EE-Anteil)"></span>` +
      `<span title="Anteil erneuerbarer Energien">EE <span class="live-value">${Math.round(energy.renShare)}&thinsp;%</span></span>` +
      load;
  } else {
    el('energy-status').innerHTML = '<span class="empty-note">Quelle derzeit nicht erreichbar</span>';
  }

  const chips = (data.lists.socialTrends || []).map((t) => {
    const count = t.count ? `<span class="chip-count">${fmtCount(t.count)}</span>` : '';
    const prefix = t.source === 'Bluesky' ? '' : '#';
    const cls = [t.source === 'Bluesky' ? 'chip-bsky' : '', t.cto ? 'chip-cto' : 'chip-dim']
      .join(' ')
      .trim();
    return `<span class="chip ${cls}" title="${esc(t.source)}"><span class="chip-tag">${prefix}${esc(t.tag)}</span>${count}</span>`;
  });
  el('trend-chips').innerHTML =
    chips.join('') || '<span class="empty-note">Keine Trend-Daten verfügbar</span>';

  // ── BCIX Internet Exchange ──────────────────────────────────
  const bcix = data.lists.bcix;
  const SVC_DOTS2 = { none: 'svc-ok', minor: 'svc-minor', major: 'svc-major', critical: 'svc-critical' };
  if (bcix && !bcix._unavailable) {
    el('bcix-status').innerHTML =
      `<span class="svc-dot ${SVC_DOTS2[bcix.indicator] || 'svc-unknown'}"></span>` +
      `<span>${bcix.indicator === 'none' ? 'Betrieb normal' : bcix.indicator === 'minor' ? 'Störung' : bcix.indicator === 'major' ? 'Teilausfall' : 'Kritisch'}</span>`;
    el('bcix-components').innerHTML = (bcix.components || [])
      .map((c) => `<span class="svc" title="${esc(c.name)}"><span class="svc-dot ${SVC_DOTS2[c.indicator] || 'svc-unknown'}"></span>${esc(c.name)}</span>`)
      .join('') || '<span class="empty-note">keine Komponentendaten</span>';
    if (bcix.points?.length > 1) {
      if (bcix.metricName) el('bcix-metric-label').textContent = bcix.metricName;
      renderBcixChart(bcix.points);
    } else {
      el('bcix-metric-label').classList.add('hidden');
      el('chart-bcix').closest('.bcix-chart-wrap').classList.add('hidden');
    }
  } else {
    el('bcix-status').innerHTML = '<span class="empty-note">Quelle nicht erreichbar</span>';
    el('bcix-components').innerHTML = '';
    el('bcix-metric-label').classList.add('hidden');
    el('chart-bcix').closest('.bcix-chart-wrap').classList.add('hidden');
  }

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
