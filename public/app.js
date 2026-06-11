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

/* CERT-Bund-Titel beginnen mit Risikoklasse, z. B. "[hoch] OpenSSL: …" */
function splitSeverity(title) {
  const m = title.match(/^\[(kritisch|hoch|mittel|niedrig)\]\s*(.*)$/i);
  if (m) return { severity: m[1].toLowerCase(), text: m[2] };
  return { severity: null, text: title };
}

function badge(text, cls) {
  return `<span class="badge ${cls}">${text}</span>`;
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
    const { severity, text } = splitSeverity(it.title);
    const sevBadge = severity ? badge(severity, `badge-${severity}`) : '';
    return `<li>${sevBadge}<span class="item-title">${esc(text)}</span><span class="item-time">${fmtTime(it.date)}</span></li>`;
  });

  renderList('list-secnews', data.lists.securityNews, (it) =>
    `<li>${badge(esc(it.source), 'badge-src')}<span class="item-title">${esc(it.title)}</span><span class="item-time">${fmtTime(it.date)}</span></li>`
  );

  const tech = [
    ...(data.lists.aiNews || []).slice(0, 4).map((it) => ({ ...it, tag: 'KI', cls: 'badge-ki' })),
    ...(data.lists.techNews || []).slice(0, 6).map((it) => ({ ...it, tag: it.source, cls: 'badge-src' })),
  ];
  renderList('list-tech', tech, (it) =>
    `<li>${badge(esc(it.tag), it.cls)}<span class="item-title">${esc(it.title)}</span><span class="item-time">${fmtTime(it.date)}</span></li>`
  );

  const politics = [
    ...(data.lists.germany || []).slice(0, 5).map((it) => ({ ...it, tag: 'DE', cls: 'badge-de' })),
    ...(data.lists.world || []).slice(0, 5).map((it) => ({ ...it, tag: 'Welt', cls: 'badge-welt' })),
  ];
  renderList('list-politics', politics, (it) =>
    `<li>${badge(it.tag, it.cls)}<span class="item-title">${esc(it.title)}</span><span class="item-time">${fmtTime(it.date)}</span></li>`
  );

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
  el('clock').textContent = now.toLocaleTimeString('de-DE');
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
