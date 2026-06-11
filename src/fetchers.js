'use strict';

const Parser = require('rss-parser');

const USER_AGENT =
  'cto-intelligence-dashboard/1.0 (+https://github.com/pxlwrk/cto-intelligence)';
const FETCH_TIMEOUT_MS = 15000;

const rssParser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
});

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
  return res.json();
}

/** Generic RSS/Atom feed -> normalized item list */
async function fetchFeed(url, sourceName, limit = 15) {
  const res = await fetchWithTimeout(url);
  const xml = await res.text();
  const feed = await rssParser.parseString(xml);
  return (feed.items || []).slice(0, limit).map((item) => ({
    title: (item.title || '').trim(),
    link: item.link || '',
    date: item.isoDate || item.pubDate || null,
    source: sourceName,
  }));
}

/** CISA Known Exploited Vulnerabilities catalog */
async function fetchKev() {
  const data = await fetchJson(
    'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
  );
  return (data.vulnerabilities || []).map((v) => ({
    cveId: v.cveID,
    vendor: v.vendorProject,
    product: v.product,
    name: v.vulnerabilityName,
    dateAdded: v.dateAdded,
    ransomware: v.knownRansomwareCampaignUse === 'Known',
  }));
}

/**
 * NVD CVE API 2.0: CVEs published in the last `days` days.
 * No API key: public rate limit is 5 requests / 30 s, so pages are
 * fetched sequentially with a delay. Capped at 3 pages (6000 CVEs).
 */
async function fetchNvdRecent(days = 7) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const fmt = (d) => d.toISOString().replace('Z', '');
  const base =
    'https://services.nvd.nist.gov/rest/json/cves/2.0/?noRejected' +
    `&pubStartDate=${encodeURIComponent(fmt(start))}` +
    `&pubEndDate=${encodeURIComponent(fmt(end))}` +
    '&resultsPerPage=2000';

  const severities = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
  let total = 0;
  let startIndex = 0;
  for (let page = 0; page < 3; page++) {
    const data = await fetchJson(`${base}&startIndex=${startIndex}`);
    total = data.totalResults || 0;
    for (const entry of data.vulnerabilities || []) {
      const metrics = entry.cve?.metrics || {};
      const cvss =
        metrics.cvssMetricV31?.[0]?.cvssData ||
        metrics.cvssMetricV40?.[0]?.cvssData ||
        metrics.cvssMetricV30?.[0]?.cvssData;
      const sev = (cvss?.baseSeverity || 'NONE').toUpperCase();
      severities[sev] = (severities[sev] || 0) + 1;
    }
    startIndex += data.resultsPerPage || 2000;
    if (startIndex >= total) break;
    await new Promise((r) => setTimeout(r, 6500));
  }
  return { total, severities, days, sampled: startIndex < total ? startIndex : total };
}

/** Hacker News top stories with scores ("tech pulse") */
async function fetchHackerNews(limit = 8) {
  const ids = await fetchJson('https://hacker-news.firebaseio.com/v0/topstories.json');
  const top = ids.slice(0, limit);
  const items = await Promise.all(
    top.map((id) =>
      fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)
    )
  );
  return items
    .filter((it) => it && it.title)
    .map((it) => ({
      title: it.title,
      link: it.url || `https://news.ycombinator.com/item?id=${it.id}`,
      score: it.score || 0,
      comments: it.descendants || 0,
    }));
}

/**
 * Tagesschau api2u (inoffiziell dokumentiert, max. 60 Requests/Stunde –
 * der Cache des Aggregators hält die Frequenz weit darunter).
 */
async function fetchTagesschau(ressort, limit = 8) {
  const data = await fetchJson(
    `https://www.tagesschau.de/api2u/news/?ressort=${encodeURIComponent(ressort)}`
  );
  return (data.news || [])
    .filter((n) => n.title && n.type !== 'video')
    .slice(0, limit)
    .map((n) => ({
      title: n.title.trim(),
      link: n.shareURL || n.detailsweb || '',
      date: n.date || null,
      source: 'Tagesschau',
      topline: n.topline || '',
    }));
}

/** Trending Hashtags im Fediverse (öffentliche API, kein Key nötig) */
async function fetchMastodonTrends(instance = 'mastodon.social', limit = 10) {
  const data = await fetchJson(`https://${instance}/api/v1/trends/tags?limit=${limit}`);
  return (data || []).map((t) => ({
    tag: t.name,
    count: (t.history || []).slice(0, 2).reduce((sum, h) => sum + Number(h.uses || 0), 0),
    source: instance,
  }));
}

/** Trending Topics auf Bluesky (öffentliche API, kein Key nötig) */
async function fetchBlueskyTrends(limit = 10) {
  const data = await fetchJson(
    'https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics'
  );
  return (data.topics || []).slice(0, limit).map((t) => ({
    tag: t.displayName || t.topic,
    count: null,
    source: 'Bluesky',
  }));
}

/**
 * Live-Status großer Cloud-/KI-Dienste über deren öffentliche
 * Statuspage-APIs (kein Key). Indicator: none | minor | major | critical.
 */
const STATUS_PAGES = [
  { name: 'GitHub', url: 'https://www.githubstatus.com/api/v2/status.json' },
  { name: 'Cloudflare', url: 'https://www.cloudflarestatus.com/api/v2/status.json' },
  { name: 'npm', url: 'https://status.npmjs.org/api/v2/status.json' },
  { name: 'Vercel', url: 'https://www.vercel-status.com/api/v2/status.json' },
  { name: 'Zoom', url: 'https://status.zoom.us/api/v2/status.json' },
  { name: 'OpenAI', url: 'https://status.openai.com/api/v2/status.json' },
  { name: 'Anthropic', url: 'https://status.anthropic.com/api/v2/status.json' },
];

async function fetchServiceStatus() {
  const statuspages = STATUS_PAGES.map(async ({ name, url }) => {
    const data = await fetchJson(url);
    return {
      name,
      indicator: data.status?.indicator || 'unknown',
      description: data.status?.description || '',
    };
  });
  const slack = (async () => {
    const data = await fetchJson('https://slack-status.com/api/v2.0.0/current');
    const incidents = data.active_incidents || [];
    const outage = incidents.some((i) => i.type === 'outage');
    return {
      name: 'Slack',
      indicator: outage ? 'major' : incidents.length > 0 ? 'minor' : 'none',
      description: incidents[0]?.title || '',
    };
  })();

  const results = await Promise.allSettled([...statuspages, slack]);
  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { name: i < STATUS_PAGES.length ? STATUS_PAGES[i].name : 'Slack', indicator: 'unknown', description: 'nicht erreichbar' }
  );
}

/**
 * Amtliche Warnmeldungen für eine Region über den Dashboard-Endpunkt der
 * NINA-API des BBK (ohne Key). Liefert alle Kanäle (MoWaS, KATWARN,
 * BIWAPP, Polizei, Hochwasser, DWD) für den angegebenen Amtlichen
 * Gemeindeschlüssel; Standard ist Berlin (110000000000).
 */
async function fetchNinaDashboard(ags = process.env.NINA_AGS || '110000000000') {
  const data = await fetchJson(`https://warnung.bund.de/api31/dashboard/${ags}.json`);
  const rank = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };
  return (data || [])
    .map((w) => {
      const payload = w.payload?.data || {};
      const severity = (payload.severity || 'Minor').replace(/^./, (c) => c.toUpperCase());
      return {
        title: w.i18nTitle?.de || payload.headline || '',
        provider: (payload.provider || String(w.id || '').split('.')[0] || '').toUpperCase(),
        severity,
        date: w.sent || w.onset || null,
      };
    })
    .filter((w) => w.title)
    .sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
}

/**
 * Stromnetz Deutschland (Energy-Charts API des Fraunhofer ISE, ohne Key):
 * EE-Anteil-Ampel (/signal) und aktuelle Netzlast (/public_power).
 */
async function fetchEnergy() {
  const lastValid = (arr) => {
    for (let i = (arr || []).length - 1; i >= 0; i--) {
      if (arr[i] !== null && arr[i] !== undefined) return arr[i];
    }
    return null;
  };

  const signal = await fetchJson('https://api.energy-charts.info/signal?country=de');
  const result = {
    renShare: lastValid(signal.share),
    signal: lastValid(signal.signal), // 0 = rot, 1 = gelb, 2 = grün, 3 = grün+
    loadGw: null,
  };
  try {
    const power = await fetchJson('https://api.energy-charts.info/public_power?country=de');
    const load = (power.production_types || []).find((p) => p.name === 'Load');
    const mw = lastValid(load?.data);
    if (mw !== null) result.loadGw = mw / 1000;
  } catch {
    // Netzlast ist optional – die Ampel allein ist aussagekräftig genug
  }
  return result;
}

/**
 * Cloudflare Radar (benötigt API-Token mit Berechtigung „Radar: Read",
 * Env-Variable CLOUDFLARE_API_TOKEN): gemeldete Internet-Ausfälle der
 * letzten 24 h und Trend des globalen Layer-7-DDoS-Volumens.
 */
async function fetchCloudflareRadar() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN nicht gesetzt');
  const get = async (path) => {
    const res = await fetchWithTimeout(`https://api.cloudflare.com/client/v4${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const body = await res.json();
    if (!body.success) throw new Error(`Radar-API: ${body.errors?.[0]?.message || 'Fehler'}`);
    return body.result;
  };

  const outages = await get('/radar/annotations/outages?dateRange=1d&limit=100&format=json');
  const annotations = outages.annotations || [];
  const isDe = (loc) => (typeof loc === 'string' ? loc : loc?.code) === 'DE';
  const result = {
    outages24h: annotations.length,
    outagesDe: annotations.filter((a) => (a.locations || []).some(isDe)).length,
    ddosTrendPct: null,
  };

  try {
    const ts = await get('/radar/attacks/layer7/timeseries?dateRange=7d&aggInterval=1d&format=json');
    const values = (ts.main?.values || []).map(Number).filter((v) => !Number.isNaN(v));
    if (values.length >= 3) {
      const latest = values[values.length - 1];
      const mean = values.slice(0, -1).reduce((a, b) => a + b, 0) / (values.length - 1);
      if (mean > 0) result.ddosTrendPct = Math.round(((latest - mean) / mean) * 100);
    }
  } catch {
    // DDoS-Trend ist optional, Ausfalldaten allein sind aussagekräftig
  }
  return result;
}

module.exports = {
  fetchFeed,
  fetchKev,
  fetchNvdRecent,
  fetchHackerNews,
  fetchTagesschau,
  fetchMastodonTrends,
  fetchBlueskyTrends,
  fetchServiceStatus,
  fetchNinaDashboard,
  fetchEnergy,
  fetchCloudflareRadar,
};
