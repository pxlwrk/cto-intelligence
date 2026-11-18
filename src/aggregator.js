'use strict';

const {
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
  fetchZeroDayClock,
} = require('./fetchers');
const { upcomingDeadlines } = require('./regulatory-calendar');

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
    name: 'NVD CVE-Statistik (7 Tage und Wochentrend)',
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
    fetch: () => fetchFeed('https://www.heise.de/rss/heise-atom.xml', 'heise', 30),
  },
  {
    id: 'golem',
    name: 'Golem.de',
    ttl: 10 * MIN,
    fetch: () => fetchFeed('https://rss.golem.de/rss.php?feed=RSS2.0', 'Golem', 30),
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
    id: 'netzpolitik',
    name: 'netzpolitik.org',
    ttl: 15 * MIN,
    fetch: () => fetchFeed('https://netzpolitik.org/feed/', 'netzpolitik.org', 30),
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
    fetch: () => fetchMastodonTrends('mastodon.social', 14),
  },
  {
    id: 'infosecTrends',
    name: 'infosec.exchange Trending Tags',
    ttl: 15 * MIN,
    fetch: () => fetchMastodonTrends('infosec.exchange', 10),
  },
  {
    id: 'chaosTrends',
    name: 'chaos.social Trending Tags',
    ttl: 15 * MIN,
    fetch: () => fetchMastodonTrends('chaos.social', 10),
  },
  {
    id: 'fossTrends',
    name: 'fosstodon.org Trending Tags',
    ttl: 15 * MIN,
    fetch: () => fetchMastodonTrends('fosstodon.org', 10),
  },
  {
    id: 'blueskyTrends',
    name: 'Bluesky Trending Topics',
    ttl: 15 * MIN,
    fetch: () => fetchBlueskyTrends(8),
  },
  {
    id: 'serviceStatus',
    name: 'Cloud-Dienste-Status (Statuspages)',
    ttl: 3 * MIN,
    fetch: fetchServiceStatus,
  },
  {
    id: 'nina',
    name: 'NINA/BBK Warnmeldungen (Region Berlin)',
    ttl: 5 * MIN,
    fetch: () => fetchNinaDashboard(),
  },
  {
    id: 'energy',
    name: 'Stromnetz (Fraunhofer ISE Energy-Charts)',
    ttl: 15 * MIN,
    fetch: fetchEnergy,
  },
  {
    id: 'weather',
    name: 'Wetter Berlin (DWD/BrightSky, UV & Pollen DWD)',
    ttl: 15 * MIN,
    fetch: fetchWeather,
  },
  // Nur aktiv, wenn ein Token hinterlegt ist (Berechtigung „Radar: Read")
  ...(process.env.CLOUDFLARE_API_TOKEN
    ? [
        {
          id: 'cloudflare',
          name: 'Cloudflare Radar',
          ttl: 10 * MIN,
          fetch: fetchCloudflareRadar,
        },
      ]
    : []),
  {
    id: 'tagesschauAusland',
    name: 'Tagesschau Ausland',
    ttl: 15 * MIN,
    fetch: () => fetchTagesschau('ausland', 8),
  },
  {
    id: 'zeroDayClock',
    name: 'Time-to-Exploit-Kennzahlen (CISA KEV + CVE Project, eigene Berechnung)',
    ttl: 60 * MIN,
    // nutzt den KEV-Katalog der Quelle „kev" mit, statt ihn erneut zu laden
    fetch: () =>
      fetchZeroDayClock(async () => {
        const entry = await getSource(SOURCES.find((src) => src.id === 'kev'));
        if (!entry.data) throw new Error('KEV-Katalog nicht verfügbar');
        return entry.data;
      }),
  },
];

const cache = new Map(); // id -> { data, fetchedAt, error }
const inflight = new Map(); // id -> Promise, verhindert Doppelabrufe derselben Quelle

function getSource(source) {
  const entry = cache.get(source.id);
  if (entry && entry.data && Date.now() - entry.fetchedAt < source.ttl) return Promise.resolve(entry);
  if (!inflight.has(source.id)) {
    const p = loadSource(source).finally(() => inflight.delete(source.id));
    inflight.set(source.id, p);
  }
  return inflight.get(source.id);
}

async function loadSource(source) {
  const entry = cache.get(source.id);
  const now = Date.now();
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
    return { level: 4, label: 'Rot: Kritisch', reason: 'Massive aktive Ausnutzung / sehr viele kritische Schwachstellen' };
  }
  if (kev7d >= 5 || cveCritical7d >= 30 || ransomwareKev30d >= 4) {
    return { level: 3, label: 'Orange: Hoch', reason: 'Deutlich erhöhte aktive Ausnutzung kritischer Schwachstellen' };
  }
  if (kev7d >= 1 || cveCritical7d >= 10) {
    return { level: 2, label: 'Gelb: Erhöht', reason: 'Aktiv ausgenutzte Schwachstellen im Beobachtungszeitraum' };
  }
  return { level: 1, label: 'Grün: Normal', reason: 'Keine auffällige Häufung aktiver Ausnutzung' };
}

function buildAdvisoryTimeline(kev, days = 14) {
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = daysAgo(i).toISOString().slice(0, 10);
    buckets.push({ date: key, kev: 0 });
  }
  const index = new Map(buckets.map((b) => [b.date, b]));
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


/** Montag (UTC) der Kalenderwoche eines Datums als YYYY-MM-DD. */
function weekStartKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Neuzugänge im CISA-KEV-Katalog je Kalenderwoche (älteste zuerst, die
 * laufende Woche zuletzt), davon mit Ransomware-Bezug, plus gleitender
 * Vier-Wochen-Durchschnitt zur Glättung.
 */
function buildKevWeekly(kev, weeks = 12) {
  const buckets = [];
  const now = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    buckets.push({ weekStart: weekStartKey(new Date(now.getTime() - i * 7 * 86400000)), kev: 0, ransomware: 0 });
  }
  const index = new Map(buckets.map((b) => [b.weekStart, b]));
  for (const v of kev) {
    if (!v.dateAdded) continue;
    const b = index.get(weekStartKey(new Date(v.dateAdded + 'T00:00:00Z')));
    if (!b) continue;
    b.kev++;
    if (v.ransomware) b.ransomware++;
  }
  return buckets.map((b, i) => {
    const window = buckets.slice(Math.max(0, i - 3), i + 1);
    const avg = window.reduce((sum, w) => sum + w.kev, 0) / window.length;
    return { ...b, avg4: Math.round(avg * 10) / 10 };
  });
}

/** Neuzugänge im KEV-Katalog im Zeitfenster [von, bis) in Tagen zurück. */
function countKevBetween(kev, fromDaysAgo, toDaysAgo, onlyRansomware = false) {
  const from = daysAgo(fromDaysAgo);
  const to = daysAgo(toDaysAgo);
  return kev.filter((v) => {
    if (onlyRansomware && !v.ransomware) return false;
    const d = new Date(v.dateAdded);
    return d >= from && d < to;
  }).length;
}

/**
 * Regulierungs- und Souveränitätsthemen. Die Zuordnung erfolgt über den
 * Titel einer Meldung; eine Meldung zählt für das erste passende Thema.
 */
const REGULATION_TOPICS = [
  { label: 'NIS2 / KRITIS', re: /nis.?2|kritis|kritische infrastruktur|it-sicherheitsgesetz|kritisdachg/i },
  { label: 'Cyber Resilience Act', re: /cyber.?resilience|\bcra\b/i },
  { label: 'KI-Regulierung', re: /ai.?act|ki-verordnung|ki-gesetz|ki-regulier|ki-aufsicht|künstliche intelligenz.{0,40}(gesetz|verordnung|regulier|aufsicht)/i },
  { label: 'Cloud & Souveränität', re: /souverän|cloud-strategie|verwaltungscloud|deutschland-stack|openDesk|sovereign|gaia-x|delos|open.?source.{0,30}(bund|verwaltung|behörde)/i },
  { label: 'Verwaltungsdigitalisierung', re: /\bozg\b|onlinezugang|registermodernisierung|digitalministerium|verwaltungsdigital|e-government|egovernment|digitale verwaltung|id-wallet|eudi|eidas|bundid|it-planungsrat/i },
  { label: 'Datenschutz & Daten', re: /dsgvo|datenschutz|data act|data governance|vorratsdaten|chatkontrolle|überwachung/i },
  { label: 'BSI & Cyberabwehr', re: /\bbsi\b|cyberabwehr|cybersicherheitsstrategie|cybersicherheitsgesetz|nationale cyber|cyber-?sicherheitsagentur|cyberresilienz/i },
];

function regulationTopic(title) {
  const hit = REGULATION_TOPICS.find((t) => t.re.test(title || ''));
  return hit ? hit.label : null;
}

function buildRegulation(lists, limit = 14) {
  const seen = new Set();
  const items = lists
    .flat()
    .filter((it) => it && it.title)
    .map((it) => ({ ...it, topic: regulationTopic(it.title) }))
    .filter((it) => it.topic)
    .filter((it) => {
      const key = it.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const counts = new Map();
  for (const it of items) counts.set(it.topic, (counts.get(it.topic) || 0) + 1);
  return {
    items: items.slice(0, limit),
    topics: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count })),
  };
}

/**
 * Management-Zusammenfassung in einfacher Sprache. Rein regelbasiert aus den
 * echten Kennzahlen abgeleitet; fehlende Daten führen zum Weglassen des
 * jeweiligen Satzes, nie zu erfundenen Werten.
 */
function buildSummary({ threat, kpis, kpiPrev, zdc, services }) {
  if (threat.level === 0) {
    return {
      headline: 'Lagebild unvollständig: Datenquellen nicht erreichbar',
      bullets: [],
      action: 'Quellen-Anzeige oben rechts prüfen. Bis die Daten wieder verfügbar sind, ist keine Aussage zur Lage möglich.',
    };
  }
  const HEADLINES = {
    1: 'Lage ruhig',
    2: 'Lage erhöht: Entwicklung beobachten',
    3: 'Lage angespannt: Patch-Priorität erhöhen',
    4: 'Lage kritisch: sofort handeln',
  };
  const ACTIONS = {
    1: 'Keine Sofortmaßnahmen nötig. Regulären Patch-Zyklus fortführen.',
    2: 'Meldungen von BSI und CERT-Bund beobachten. Betroffene Produkte im eigenen Bestand prüfen.',
    3: 'Kritische Patches für aus dem Internet erreichbare Systeme innerhalb von 72 Stunden einplanen.',
    4: 'Notfall-Patchprozess aktivieren, Leitung und IT-Sicherheitsbeauftragte informieren, Internet-Systeme zuerst absichern.',
  };
  const plural = (n, one, many) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
  const trendWord = (now, prev) => {
    if (prev === null || prev === undefined) return '';
    if (now > prev) return `, mehr als in der Vorwoche (${prev.toLocaleString('de-DE')})`;
    if (now < prev) return `, weniger als in der Vorwoche (${prev.toLocaleString('de-DE')})`;
    return ', unverändert zur Vorwoche';
  };

  const bullets = [];
  if (kpis.kev7d !== null && kpis.kev7d !== undefined) {
    bullets.push(
      `${plural(kpis.kev7d, 'Schwachstelle wurde', 'Schwachstellen wurden')} in den letzten 7 Tagen als aktiv ausgenutzt bestätigt${trendWord(kpis.kev7d, kpiPrev.kev7d)}.`
    );
  }
  if (kpis.ransomwareKev30d !== null && kpis.ransomwareKev30d !== undefined) {
    bullets.push(
      kpis.ransomwareKev30d > 0
        ? `${plural(kpis.ransomwareKev30d, 'ausgenutzte Lücke wird', 'ausgenutzte Lücken werden')} in 30 Tagen bereits von Erpressergruppen (Ransomware) eingesetzt.`
        : 'Zurzeit sind keine neuen Lücken mit Ransomware-Bezug bekannt.'
    );
  }
  if (zdc && zdc.medianTteDays !== null && zdc.medianTteDays !== undefined) {
    bullets.push(
      `Angreifer nutzen neue Lücken im Median nach ${zdc.medianTteDays.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tagen aus. Das Zeitfenster zum Patchen ist entsprechend kurz.`
    );
  }
  if (services && services.known > 0) {
    bullets.push(
      services.disrupted > 0
        ? `${services.disrupted} von ${services.known} beobachteten Cloud-Diensten ${services.disrupted === 1 ? 'meldet eine Störung' : 'melden Störungen'} (${services.names.join(', ')}).`
        : `Alle ${services.known} beobachteten Cloud-Dienste laufen ohne gemeldete Störung.`
    );
  }
  return {
    headline: HEADLINES[threat.level],
    bullets: bullets.slice(0, 4),
    action: ACTIONS[threat.level],
  };
}

/** Auswertung der Dienste-Ampel: wie viele Dienste melden eine Störung. */
function summarizeServices(list) {
  const known = (list || []).filter((s) => s.indicator && s.indicator !== 'unknown');
  const disrupted = known.filter((s) => s.indicator !== 'none');
  return { known: known.length, disrupted: disrupted.length, names: disrupted.map((s) => s.name) };
}

function mergeNews(lists, limit) {
  return lists
    .flat()
    .filter((it) => it && it.title)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, limit);
}

/**
 * CTO-Relevanzfilter für Social-Trends: Tags zu Technologie, Cybersicherheit,
 * KI und Digitalpolitik werden bevorzugt; allgemeine Trends füllen nur auf,
 * wenn nicht genug fachliche Treffer vorhanden sind.
 */
const CTO_TOPIC_PATTERNS = [
  /\b(ai|ki|llm|gpt|cve|5g|6g|iot|vpn|sso|api|soc|aws|gcp|k8s|oss|gnu|cli|sdk|bgp|asn|ix\b)\b/i,
  /cyber|secur|sicherheit|hack|breach|leak|ransom|malware|phish|exploit|zero.?day|vuln|patch|firewall|infosec|kritis|botnet|ddos|spyware|backdoor|darknet|cisa|bsi\b|pentest|ctf\b|nist\b|cvss|soc2|iso.?27/i,
  /cloud|software|open.?source|linux|unix|windows|microsoft|google|apple|nvidia|intel\b|amd\b|sap\b|chip|halbleiter|semicon|quant|crypto|krypto|encrypt|verschlüssel|datenschutz|privacy|datacenter|rechenzentrum|server|kernel|browser|android|iphone|foss|python|rust\b|golang|javascript|typescript|nodejs|react\b|kotlin|docker|kubernetes|terraform|ansible|gitlab|github|devops|devsecops|platform|framework|saas|paas|iaas|postgres|redis|elasticsearch/i,
  /digital|verwaltung|behörde|infrastruktur|netzwerk|glasfaser|robot|automatis|telekom|outage|störung|ausfall|künstliche|intelligen|nis.?2|dsgvo|gdpr|dora\b|eidas|ai.?act|datenleck|datenpanne|chatgpt|copilot|gemini|claude|deepseek|mistral|openai|anthropic|internet.?exchange|peering|routing|bgp\b|anycast/i,
];

function isCtoTopic(tag) {
  // CamelCase-Tags wie "AIAct", "KIGesetz" oder "ZeroDay" vor dem
  // Mustervergleich in Wörter zerlegen, sonst scheitern
  // Wortgrenzen-Muster wie \bai\b.
  const normalized = tag
    .replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2')
    .replace(/([A-ZÄÖÜ]+)([A-ZÄÖÜ][a-zäöüß])/g, '$1 $2')
    .replace(/([a-zA-Zäöüß])(\d)/g, '$1 $2');
  return CTO_TOPIC_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Quellen zusammenführen, deduplizieren und auf CTO-Themen filtern.
 * Globale Pop-Trends werden verworfen; wenn weniger als 5 CTO-Tags
 * verfügbar sind (z. B. wegen Quellausfällen), wird mit allgemeinen
 * Tech-Trends aufgefüllt – kenntlich gemacht durch `cto: false`.
 */
function mergeTrends(trendLists, limit = 14) {
  const byTag = new Map();
  for (const t of trendLists.flat()) {
    if (!t?.tag) continue;
    const key = t.tag.toLowerCase();
    const existing = byTag.get(key);
    if (!existing || (t.count || 0) > (existing.count || 0)) byTag.set(key, t);
  }
  const sorted = [...byTag.values()].sort((a, b) => (b.count || 0) - (a.count || 0));
  const ctoTags = sorted.filter((t) => isCtoTopic(t.tag)).slice(0, limit).map((t) => ({ ...t, cto: true }));
  if (ctoTags.length >= 5) return ctoTags;
  // Auffüllen: allgemeine Tags ohne CTO-Bezug, gedimmt dargestellt
  const usedKeys = new Set(ctoTags.map((t) => t.tag.toLowerCase()));
  const extra = sorted
    .filter((t) => !usedKeys.has(t.tag.toLowerCase()))
    .slice(0, limit - ctoTags.length)
    .map((t) => ({ ...t, cto: false }));
  return [...ctoTags, ...extra];
}

function summarizeDwd(warnings) {
  const rank = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3 };
  const severe = warnings.filter((w) => w.severity === 'Severe' || w.severity === 'Extreme');
  const worst = warnings.reduce(
    (acc, w) => ((rank[w.severity] ?? 9) < (rank[acc] ?? 9) ? w.severity : acc),
    null
  );
  const events = [...new Set(warnings.map((w) => w.title))].slice(0, 6);
  return { total: warnings.length, severe: severe.length, worst, events };
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

  // Ohne KEV-Katalog gibt es keine belastbare Aussage: Kennzahlen bleiben leer
  // (null), statt aus einer leeren Liste „0 Schwachstellen" abzuleiten.
  const kevOk = kev.length > 0;
  const kev7d = kevOk ? countSince(kev, 7, 'dateAdded') : null;
  const kev30d = kevOk ? countSince(kev, 30, 'dateAdded') : null;
  const ransomwareKev30d = kevOk
    ? kev.filter((v) => v.ransomware && new Date(v.dateAdded) >= daysAgo(30)).length
    : null;
  const cveCritical7d = nvd?.severities?.CRITICAL ?? 0;
  const weekly = nvd?.weeklyCritical;
  const services = summarizeServices(get('serviceStatus'));
  const zdc = get('zeroDayClock', null);

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

  // Werte der jeweils vorherigen Periode für den Vorwochenvergleich
  const kpiPrev = {
    cveCritical7d: weekly && weekly.length >= 2 ? weekly[weekly.length - 2].critical : null,
    kev7d: kevOk ? countKevBetween(kev, 14, 7) : null,
    ransomwareKev30d: kevOk ? countKevBetween(kev, 60, 30, true) : null,
  };
  const threatLevel = kevOk
    ? computeThreatLevel({ cveCritical7d, kev7d, ransomwareKev30d })
    : {
        level: 0,
        label: 'Unbekannt',
        reason: 'Der CISA-KEV-Katalog ist derzeit nicht erreichbar, eine Einstufung ist nicht möglich',
      };
  const regulation = buildRegulation([
    get('netzpolitik'),
    get('heise'),
    get('golem'),
    get('tagesschauInland'),
    get('bsiCsw'),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    demo: false,
    threatLevel,
    summary: buildSummary({ threat: threatLevel, kpis, kpiPrev, zdc, services }),
    kpis,
    kpiPrev,
    charts: {
      cveSeverity: nvd?.severities ?? null,
      cveWeeklyCritical: weekly ?? null,
      advisoryTimeline: buildAdvisoryTimeline(kev),
      kevWeekly: kevOk ? buildKevWeekly(kev) : null,
      kevTopVendors: topVendors(kev),
      regulationTopics: regulation.topics,
    },
    lists: {
      certBund: certBund.slice(0, 14),
      euAdvisories: get('certEu').slice(0, 4),
      securityNews: mergeNews([get('heiseSecurity'), get('hackerNewsSec'), get('bsiCsw')], 12),
      techNews: mergeNews([get('heise'), get('golem')], 10),
      aiNews: mergeNews([get('venturebeatAi'), get('mitTechReview')], 6),
      hackerNews: get('hn'),
      germany: get('tagesschauInland'),
      world: get('tagesschauAusland'),
      serviceStatus: get('serviceStatus'),
      // DWD-Wetterwarnungen und Bevölkerungsschutz (alle übrigen Kanäle),
      // beides auf die konfigurierte Region (Standard Berlin) beschränkt
      // null = Quelle gestört (nicht als „keine Warnungen" darstellen)
      dwd: results.nina?.data ? summarizeDwd(get('nina').filter((w) => w.provider === 'DWD')) : null,
      civilProtection: results.nina?.data
        ? get('nina')
            .filter((w) => w.provider !== 'DWD')
            .slice(0, 6)
        : null,
      energy: get('energy', null),
      weather: get('weather', null),
      // null = nicht konfiguriert (Segment ausblenden); unavailable = gestört
      cloudflare: process.env.CLOUDFLARE_API_TOKEN
        ? get('cloudflare', { unavailable: true })
        : null,
      zeroDayClock: zdc,
      regulation: regulation.items,
      deadlines: upcomingDeadlines(5),
      serviceSummary: services,
      socialTrends: mergeTrends([
        get('infosecTrends'),
        get('chaosTrends'),
        get('fossTrends'),
        get('mastodonTrends'),
        get('blueskyTrends'),
      ]),
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

module.exports = {
  buildDashboard,
  SOURCES,
  // für Tests
  _internals: { buildKevWeekly, countKevBetween, buildRegulation, regulationTopic, buildSummary, summarizeServices, weekStartKey },
};
