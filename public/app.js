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
Chart.defaults.font.family = '"Segoe UI", "Inter", system-ui, sans-serif';
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

function renderList(id, items, render) {
  const ul = el(id);
  if (!items || items.length === 0) {
    ul.innerHTML = '<li class="empty-note">Quelle derzeit nicht erreichbar</li>';
    return;
  }
  ul.innerHTML = items.map(render).join('');
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
          label: 'CERT-Bund Advisories',
          data: (timeline || []).map((b) => b.certBund),
          backgroundColor: '#38bdf8',
          borderRadius: 3,
        },
        {
          label: 'KEV-Neuzugänge (aktiv ausgenutzt)',
          data: (timeline || []).map((b) => b.kev),
          backgroundColor: '#f97316',
          borderRadius: 3,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { grid: { display: false }, stacked: false },
        y: { beginAtZero: true, ticks: { precision: 0 } },
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
    return `<li class="${status === 'update' ? 'item-update' : 'item-new'}">${dot}<div class="item-body"><span class="item-title">${esc(text)}</span>${meta([fmtTime(it.date)])}</div></li>`;
  });

  renderList('list-secnews', data.lists.securityNews, (it) =>
    `<li><div class="item-body"><span class="item-title">${esc(it.title)}</span>${meta([esc(it.source), fmtTime(it.date)])}</div></li>`
  );

  const byDate = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);
  const tech = [
    ...(data.lists.aiNews || []).slice(0, 4).map((it) => ({ ...it, ki: true })),
    ...(data.lists.techNews || []).slice(0, 6),
  ].sort(byDate);
  renderList('list-tech', tech, (it) =>
    `<li>${it.ki ? '<span class="dot dot-ki" title="KI"></span>' : ''}<div class="item-body"><span class="item-title">${esc(it.title)}</span>${meta([esc(it.source), fmtTime(it.date)])}</div></li>`
  );

  const politics = [
    ...(data.lists.germany || []).slice(0, 5).map((it) => ({ ...it, region: 'DE' })),
    ...(data.lists.world || []).slice(0, 5).map((it) => ({ ...it, region: 'Welt' })),
  ].sort(byDate);
  renderList('list-politics', politics, (it) =>
    `<li><div class="item-body"><span class="item-title">${esc(it.title)}</span>${meta([it.region, fmtTime(it.date)])}</div></li>`
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
    const cls = [t.source === 'Bluesky' ? 'chip-bsky' : '', t.cto ? 'chip-cto' : '']
      .join(' ')
      .trim();
    return `<span class="chip ${cls}" title="${esc(t.source)}"><span class="chip-tag">${prefix}${esc(t.tag)}</span>${count}</span>`;
  });
  el('trend-chips').innerHTML =
    chips.join('') || '<span class="empty-note">Quelle derzeit nicht erreichbar</span>';

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

async function refresh() {
  try {
    const res = await fetch('/api/dashboard', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json());
  } catch (err) {
    console.error('Aktualisierung fehlgeschlagen:', err);
    el('updated').innerHTML = '<span class="stale">Aktualisierung fehlgeschlagen</span>';
  }
}

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
