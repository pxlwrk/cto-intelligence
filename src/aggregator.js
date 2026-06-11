'use strict';

const {
  fetchFeed,
  fetchKev,
  fetchNvdRecent,
  fetchHackerNews,
  fetchTagesschau,
  fetchMastodonTrends,
  fetchBlueskyTrends,
} = require('./fetchers');

const MIN = 60 * 1000;

/**
 * Quellenkatalog. Jede Quelle hat eine eigene Cache-TTL; bei Fehlern wird
 * der letzte erfolgreiche Stand weiterverwendet (stale-while-error), damit
 * das Kiosk-Dashboard nie leerläuft, nur weil eine Quelle gerade klemmt.
 */
const SOURCES = [
  {
    id: 'certBund',
    name: 'CERT-Bund (WID Security Advisories)',
    ttl: 10 * MIN,
    fetch: () =>
      fetchFeed('https://wid.cert-bund.de/content/public/securityAdvisory/rss', 'CERT-Bund', 30),
  },
  {
    id: 'bsiCsw',
    name: 'BSI Cyber-Sicherheitswarnungen',
    ttl: 10 * MIN,
    fetch: () =>
      fetchFeed(
        'https://www.bsi.bund.de/SiteGlobals/Functions/RSSFeed/RSSNewsfeed/RSSNewsfeed_CSW.xml',
        'BSI',
        15
      ),
  },
  {
    id: 'certEu',
    name: 'CERT-EU Security Advisories',
    ttl: 15 * MIN,
    fetch: () =>
      fetchFeed('https://cert.europa.eu/publications/security-advisories-rss', 'CERT-EU', 10),
  },
  {
    id: 'kev',
    name: 'CISA Known Exploited Vulnerabilities',
    ttl: 30 * MIN,
    fetch: fetchKev,
  },
  {
    id: 'nvd',
    name: 'NVD CVE-Statistik (7 Tage)',
    ttl: 60 * MIN,
    fetch: () => fetchNvdRecent(7),
  },
  {
    id: 'heiseSecurity',
    name: 'heise Security',
    ttl: 10 * MIN,
    fetch: () => fetchFeed('https://www.heise.de/security/rss/news-atom.xml', 'heise Security', 10),
  },
  {
    id: 'hackerNewsSec',
    name: 'The Hacker News',
    ttl: 15 * MIN,
    fetch: () => fetchFeed('https://feeds.feedburner.com/TheHackersNews', 'The Hacker News', 10),
  },
  {
    id: 'heise',
    name: 'heise online',
    ttl: 10 * MIN,
    fetch: () => fetchFeed('https://www.heise.de/rss/heise-atom.xml', 'heise', 12),
  },
  {
    id: 'golem',
    name: 'Golem.de',
    ttl: 10 * MIN,
    fetch: () => fetchFeed('https://rss.golem.de/rss.php?feed=RSS2.0', 'Golem', 12),
  },
  {
    id: 'venturebeatAi',
    name: 'VentureBeat AI',
    ttl: 15 * MIN,
    fetch: () => fetchFeed('https://venturebeat.com/category/ai/feed/', 'VentureBeat AI', 10),
  },
  {
    id: 'mitTechReview',
    name: 'MIT Technology Review',
    ttl: 30 * MIN,
    fetch: () => fetchFeed('https://www.technologyreview.com/feed/', 'MIT Tech Review', 10),
  },
  {
    id: 'hn',
    name: 'Hacker News Top Stories',
    ttl: 10 * MIN,
    fetch: () => fetchHackerNews(8),
  },
  {
    id: 'tagesschauInland',
    name: 'Tagesschau Inland',
    ttl: 15 * MIN,
    fetch: () => fetchTagesschau('inland', 8),
  },
  {
    id: 'mastodonTrends',
    name: 'Mastodon Trending Tags',
    ttl: 15 * MIN,
    fetch: () => fetchMastodonTrends(10),
  },
  {
    id: 'blueskyTrends',
    name: 'Bluesky Trending Topics',
    ttl: 15 * MIN,
    fetch: () => fetchBlueskyTrends(8),
  },
  {
    id: 'tagesschauAusland',
    name: 'Tagesschau Ausland',
    ttl: 15 * MIN,
    fetch: () => fetchTagesschau('ausland', 8),
  },
];

const cache = new Map(); // id -> { data, fetchedAt, error }

async function getSource(source) {
  const entry = cache.get(source.id);
  const now = Date.now();
  if (entry && entry.data && now - entry.fetchedAt < source.ttl) return entry;

  try {
    const data = await source.fetch();
    const fresh = { data, fetchedAt: now, error: null };
    cache.set(source.id, fresh);
    return fresh;
  } catch (err) {
    const stale = entry && entry.data ? entry : { data: null, fetchedAt: null };
    const result = { ...stale, error: err.message };
    cache.set(source.id, result);
    console.error(`[${source.id}] ${err.message}`);
    return result;
  }
}

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 3600 * 1000);
}

function countSince(items, days, dateField = 'date') {
  const cutoff = daysAgo(days);
  return items.filter((it) => it[dateField] && new Date(it[dateField]) >= cutoff).length;
}

/** Heuristische Lageeinstufung in Anlehnung an die vierstufige BSI-Skala. */
function computeThreatLevel({ cveCritical7d, kev7d, ransomwareKev30d }) {
  if (kev7d >= 10 || cveCritical7d >= 60 || ransomwareKev30d >= 8) {
    return { level: 4, label: 'Rot – Kritisch', reason: 'Massive aktive Ausnutzung / sehr viele kritische Schwachstellen' };
  }
  if (kev7d >= 5 || cveCritical7d >= 30 || ransomwareKev30d >= 4) {
    return { level: 3, label: 'Orange – Hoch', reason: 'Deutlich erhöhte aktive Ausnutzung kritischer Schwachstellen' };
  }
  if (kev7d >= 1 || cveCritical7d >= 10) {
    return { level: 2, label: 'Gelb – Erhöht', reason: 'Aktiv ausgenutzte Schwachstellen im Beobachtungszeitraum' };
  }
  return { level: 1, label: 'Grün – Normal', reason: 'Keine auffällige Häufung aktiver Ausnutzung' };
}

function buildAdvisoryTimeline(certBund, kev, days = 14) {
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = daysAgo(i);
    const key = day.toISOString().slice(0, 10);
    buckets.push({ date: key, certBund: 0, kev: 0 });
  }
  const index = new Map(buckets.map((b) => [b.date, b]));
  for (const item of certBund) {
    const key = item.date ? new Date(item.date).toISOString().slice(0, 10) : null;
    if (key && index.has(key)) index.get(key).certBund++;
  }
  for (const v of kev) {
    if (v.dateAdded && index.has(v.dateAdded)) index.get(v.dateAdded).kev++;
  }
  return buckets;
}

function topVendors(kev, days = 90, limit = 8) {
  const cutoff = daysAgo(days);
  const counts = new Map();
  for (const v of kev) {
    if (new Date(v.dateAdded) >= cutoff) {
      counts.set(v.vendor, (counts.get(v.vendor) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([vendor, count]) => ({ vendor, count }));
}

function mergeNews(lists, limit) {
  return lists
    .flat()
    .filter((it) => it && it.title)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, limit);
}

/** Mastodon (mit Nutzungszahlen) zuerst, Bluesky-Themen ohne Duplikate dahinter. */
function mergeTrends(mastodon, bluesky, limit = 14) {
  const seen = new Set(mastodon.map((t) => t.tag.toLowerCase()));
  const merged = [
    ...[...mastodon].sort((a, b) => (b.count || 0) - (a.count || 0)),
    ...bluesky.filter((t) => !seen.has(t.tag.toLowerCase())),
  ];
  return merged.slice(0, limit);
}

async function buildDashboard() {
  const results = {};
  await Promise.all(
    SOURCES.map(async (s) => {
      results[s.id] = await getSource(s);
    })
  );

  const get = (id, fallback = []) => results[id]?.data ?? fallback;

  const certBund = get('certBund');
  const kev = get('kev');
  const nvd = get('nvd', null);

  const kev7d = countSince(kev, 7, 'dateAdded');
  const kev30d = countSince(kev, 30, 'dateAdded');
  const ransomwareKev30d = kev.filter(
    (v) => v.ransomware && new Date(v.dateAdded) >= daysAgo(30)
  ).length;
  const cveCritical7d = nvd?.severities?.CRITICAL ?? 0;

  const kpis = {
    cveTotal7d: nvd?.total ?? null,
    cveCritical7d: nvd ? cveCritical7d : null,
    cveHigh7d: nvd?.severities?.HIGH ?? null,
    kev7d,
    kev30d,
    ransomwareKev30d,
    certBund7d: countSince(certBund, 7),
    bsiCsw7d: countSince(get('bsiCsw'), 7),
  };

  return {
    generatedAt: new Date().toISOString(),
    demo: false,
    threatLevel: computeThreatLevel({ cveCritical7d, kev7d, ransomwareKev30d }),
    kpis,
    charts: {
      cveSeverity: nvd?.severities ?? null,
      advisoryTimeline: buildAdvisoryTimeline(certBund, kev),
      kevTopVendors: topVendors(kev),
    },
    lists: {
      certBund: certBund.slice(0, 9),
      euAdvisories: get('certEu').slice(0, 4),
      securityNews: mergeNews([get('heiseSecurity'), get('hackerNewsSec'), get('bsiCsw')], 9),
      techNews: mergeNews([get('heise'), get('golem')], 8),
      aiNews: mergeNews([get('venturebeatAi'), get('mitTechReview')], 6),
      hackerNews: get('hn'),
      germany: get('tagesschauInland'),
      world: get('tagesschauAusland'),
      socialTrends: mergeTrends(get('mastodonTrends'), get('blueskyTrends')),
    },
    sources: SOURCES.map((s) => ({
      id: s.id,
      name: s.name,
      ok: !results[s.id].error && !!results[s.id].data,
      stale: !!results[s.id].error && !!results[s.id].data,
      fetchedAt: results[s.id].fetchedAt ? new Date(results[s.id].fetchedAt).toISOString() : null,
      error: results[s.id].error || null,
    })),
  };
}

module.exports = { buildDashboard, SOURCES };
