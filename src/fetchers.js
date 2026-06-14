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

/** Pollen-Belastungsstufen des DWD ("2-3" -> 2.5) */
function pollenLevel(value) {
  if (!value || value === '-1') return 0;
  const parts = String(value).split('-').map(Number);
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * Wetterblock: amtliche DWD-Stationsmesswerte über BrightSky, ergänzt um
 * UV-Index und Pollenflug direkt vom DWD (opendata.dwd.de) sowie
 * Tages-Min/Max und Sonnenzeiten von Open-Meteo. Gefühlte Temperatur wird
 * aus Temperatur, Feuchte und Wind berechnet (Apparent Temperature).
 */
async function fetchWeather() {
  const lat = process.env.WEATHER_LAT || '52.52';
  const lon = process.env.WEATHER_LON || '13.41';
  const uvCity = process.env.WEATHER_UV_CITY || 'Berlin';
  const pollenRegion = process.env.WEATHER_POLLEN_REGION || 'Berlin';

  // Messwerte sind Pflicht – ohne sie gilt die Quelle als gestört
  const cw = await fetchJson(`https://api.brightsky.dev/current_weather?lat=${lat}&lon=${lon}`);
  const w = cw.weather || {};
  const tempC = w.temperature ?? null;
  const windKmh = w.wind_speed_10 ?? null;
  let feels = null;
  if (tempC !== null && w.relative_humidity != null && windKmh !== null) {
    const e = (w.relative_humidity / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
    feels = Math.round((tempC + 0.33 * e - 0.7 * (windKmh / 3.6) - 4) * 10) / 10;
  }
  const result = {
    temp: tempC,
    feels,
    humidity: w.relative_humidity ?? null,
    precip: w.precipitation_60 ?? w.precipitation_30 ?? null,
    icon: w.icon || w.condition || null,
    windKmh,
    gustKmh: w.wind_gust_speed_10 ?? null,
    windDir: w.wind_direction_10 ?? null,
    pressure: w.pressure_msl ?? null,
    cloud: w.cloud_cover ?? null,
    station: cw.sources?.[0]?.station_name || null,
    tmax: null,
    tmin: null,
    sunrise: null,
    sunset: null,
    uv: null,
    pollen: null,
  };

  // Zusatzwerte sind optional und fallen einzeln aus
  const extras = await Promise.allSettled([
    fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset' +
        '&timezone=Europe%2FBerlin&forecast_days=1'
    ),
    fetchJson('https://opendata.dwd.de/climate_environment/health/alerts/uvi.json'),
    fetchJson('https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json'),
  ]);

  if (extras[0].status === 'fulfilled') {
    const d = extras[0].value.daily || {};
    result.tmax = d.temperature_2m_max?.[0] ?? null;
    result.tmin = d.temperature_2m_min?.[0] ?? null;
    result.sunrise = d.sunrise?.[0] ?? null;
    result.sunset = d.sunset?.[0] ?? null;
  }
  if (extras[1].status === 'fulfilled') {
    const entry = (extras[1].value.content || []).find((c) =>
      (c.city || '').toLowerCase().includes(uvCity.toLowerCase())
    );
    result.uv = entry?.forecast?.today ?? null;
  }
  if (extras[2].status === 'fulfilled') {
    const region = (extras[2].value.content || []).find((c) =>
      `${c.region_name} ${c.partregion_name}`.toLowerCase().includes(pollenRegion.toLowerCase())
    );
    if (region?.Pollen) {
      const top = Object.entries(region.Pollen)
        .map(([type, v]) => ({ type, level: pollenLevel(v.today) }))
        .filter((p) => p.level > 0)
        .sort((a, b) => b.level - a.level)
        .slice(0, 2);
      result.pollen = { max: top[0]?.level ?? 0, top };
    }
  }
  return result;
}

/**
 * Internet Exchange Status: DE-CIX Frankfurt und BCIX Berlin.
 *
 * Quellen:
 * · PeeringDB (public, kein Key): Mitglieds-ASN-Anzahl beider IXe
 *   DE-CIX Frankfurt = PeeringDB-ID 31, BCIX Berlin = ID 87
 * · BCIX Cachet v1 (status.bcix.net): Komponentenstatus;
 *   erreichbar vom Ministeriums-/Pi-Netz, nicht von Cloud-IPs
 *
 * Cachet-Statuscodes: 1 = Operational, 2 = Performance Issues,
 *                     3 = Partial Outage, 4 = Major Outage
 */
async function fetchIxStatus() {
  const CACHET = { 1: 'none', 2: 'minor', 3: 'major', 4: 'critical' };

  const normPdb = (resp) => {
    if (resp.status !== 'fulfilled') return null;
    const d = (resp.value?.data || [])[0];
    if (!d) return null;
    return {
      name: d.name || '',
      city: d.city || '',
      netCount: typeof d.net_count === 'number' ? d.net_count : null,
      updated: d.updated || null,
    };
  };

  const [pdbDecix, pdbBcix, cachetBcix] = await Promise.allSettled([
    fetchJson('https://www.peeringdb.com/api/ix/31'),   // DE-CIX Frankfurt
    fetchJson('https://www.peeringdb.com/api/ix/87'),   // BCIX Berlin
    fetchJson('https://status.bcix.net/api/v1/components'),
  ]);

  let bcixIndicator = 'unknown';
  let bcixComponents = [];
  if (cachetBcix.status === 'fulfilled') {
    const raw = cachetBcix.value?.data || [];
    const worst = raw.reduce((w, c) => Math.max(w, c.status || 1), 1);
    bcixIndicator = CACHET[worst] || 'none';
    bcixComponents = raw
      .filter((c) => c.enabled !== false)
      .map((c) => ({ name: c.name, indicator: CACHET[c.status] || 'unknown' }));
  }

  return {
    decix: normPdb(pdbDecix),
    bcix: {
      ...(normPdb(pdbBcix) || { name: 'BCIX Berlin', city: 'Berlin', netCount: null }),
      indicator: bcixIndicator,
      components: bcixComponents,
    },
  };
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
  fetchWeather,
  fetchIxStatus,
};
