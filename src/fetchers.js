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

module.exports = { fetchFeed, fetchKev, fetchNvdRecent, fetchHackerNews, fetchTagesschau };
