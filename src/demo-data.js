'use strict';

/**
 * Realistisch wirkende Beispieldaten für den Demo-Modus (DEMO=1).
 * Der Demo-Modus dient ausschließlich der Layout-Vorschau ohne
 * Internetzugang – im Produktivbetrieb werden niemals Demo-Daten
 * angezeigt, fehlende Quellen werden stattdessen als gestört markiert.
 */

function iso(daysBack, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setHours(hour, (daysBack * 17) % 60, 0, 0);
  return d.toISOString();
}

function dateKey(daysBack) {
  return iso(daysBack).slice(0, 10);
}

function buildDemoDashboard() {
  const certBund = [
    { title: '[NEU] [UNGEPATCHT] [kritisch] Ivanti Connect Secure: Schwachstelle ermöglicht Umgehung der Authentisierung und Ausführen von beliebigem Programmcode mit Administratorrechten', date: iso(0, 7) },
    { title: '[NEU] [hoch] Cisco IOS XE: Mehrere Schwachstellen ermöglichen Codeausführung', date: iso(0, 8) },
    { title: '[UPDATE] [UNGEPATCHT] [hoch] Atlassian Confluence: Schwachstelle ermöglicht Offenlegung von Informationen', date: iso(0, 6) },
    { title: '[UPDATE] [hoch] Linux-Kernel: Mehrere Schwachstellen ermöglichen Privilegieneskalation und Denial of Service', date: iso(1) },
    { title: '[NEU] [mittel] OpenSSL: Schwachstelle ermöglicht Denial of Service', date: iso(1, 14) },
    { title: '[UPDATE] [hoch] Microsoft Exchange Server: Schwachstelle ermöglicht Codeausführung', date: iso(2) },
    { title: '[NEU] [hoch] VMware ESXi: Mehrere Schwachstellen ermöglichen Ausbruch aus der VM', date: iso(2, 16) },
    { title: '[UPDATE] [mittel] Mozilla Firefox: Mehrere Schwachstellen', date: iso(3) },
    { title: '[NEU] [hoch] Fortinet FortiOS: Schwachstelle ermöglicht Codeausführung', date: iso(4) },
    { title: '[UPDATE] [niedrig] GitLab: Mehrere Schwachstellen ermöglichen Offenlegung von Informationen', date: iso(5) },
  ].map((it) => ({ ...it, link: '#', source: 'CERT-Bund' }));

  const securityNews = [
    { title: 'BSI warnt vor aktiver Ausnutzung der Ivanti-Lücke in Bundesbehörden', source: 'BSI', date: iso(0, 9) },
    { title: 'Ransomware-Gruppe veröffentlicht Daten eines Energieversorgers', source: 'heise Security', date: iso(0, 7) },
    { title: 'Critical Ivanti Zero-Day Exploited in the Wild, CISA Issues Emergency Directive', source: 'The Hacker News', date: iso(0, 6) },
    { title: 'Phishing-Kampagne zielt auf Microsoft-365-Konten der öffentlichen Verwaltung', source: 'heise Security', date: iso(1, 15) },
    { title: 'New Botnet Targets Unpatched Edge Devices Across Europe', source: 'The Hacker News', date: iso(1, 11) },
    { title: 'Supply-Chain-Angriff über kompromittiertes npm-Paket entdeckt', source: 'heise Security', date: iso(2, 10) },
    { title: 'ENISA Threat Landscape: DDoS-Angriffe auf EU-Institutionen nehmen zu', source: 'The Hacker News', date: iso(2, 8) },
    { title: 'BSI veröffentlicht Mindeststandard für Cloud-Nutzung in der Verwaltung', source: 'BSI', date: iso(3, 12) },
    { title: 'Kritische Schwachstelle in weitverbreiteter Firewall-Appliance', source: 'heise Security', date: iso(3, 9) },
  ].map((it) => ({ ...it, link: '#' }));

  const techNews = [
    { title: 'Bund beschließt Cloud-Strategie: Souveräne Cloud für die Verwaltung kommt', source: 'heise', date: iso(0, 10) },
    { title: 'EU-Parlament einigt sich auf Durchführungsverordnung zum AI Act', source: 'Golem', date: iso(0, 8) },
    { title: 'Deutsche Verwaltungscloud: Erste Ministerien migrieren produktiv', source: 'Golem', date: iso(1, 13) },
    { title: 'OZG 3.0: Neue Frist für digitale Verwaltungsleistungen', source: 'heise', date: iso(1, 9) },
    { title: 'Open-Source-Strategie des Bundes: openDesk erreicht Version 2.0', source: 'heise', date: iso(2, 11) },
    { title: 'Rechenzentren: Strombedarf durch KI wächst schneller als prognostiziert', source: 'Golem', date: iso(2, 9) },
    { title: 'Quantencomputing: Forschungszentrum Jülich nimmt 1000-Qubit-System in Betrieb', source: 'heise', date: iso(3, 14) },
    { title: 'IT-Planungsrat beschließt verbindliche Standards für Schnittstellen', source: 'Golem', date: iso(3, 10) },
  ].map((it) => ({ ...it, link: '#' }));

  const aiNews = [
    { title: 'Anthropic veröffentlicht neue Modellgeneration für Behörden-Workloads', source: 'VentureBeat AI', date: iso(0, 9) },
    { title: 'EU AI Act: Erste Konformitätsbewertungen für Hochrisiko-Systeme', source: 'MIT Tech Review', date: iso(0, 7) },
    { title: 'Studie: KI-Assistenten steigern Produktivität in der Verwaltung um 23 %', source: 'VentureBeat AI', date: iso(1, 12) },
    { title: 'Open-Weight-Modelle schließen Lücke zu proprietären Systemen', source: 'MIT Tech Review', date: iso(2, 10) },
    { title: 'Deepfake-Erkennung: Neue Verfahren für Behörden im Praxistest', source: 'VentureBeat AI', date: iso(2, 8) },
    { title: 'KI-Agenten in der Cyberabwehr: Erste SOC-Pilotprojekte', source: 'MIT Tech Review', date: iso(3, 11) },
  ].map((it) => ({ ...it, link: '#' }));

  const hackerNews = [
    { title: 'Show HN: Open-source SIEM built on ClickHouse', score: 612, comments: 187 },
    { title: 'Post-quantum cryptography is now default in OpenSSH', score: 548, comments: 203 },
    { title: 'The state of European cloud sovereignty in 2026', score: 431, comments: 256 },
    { title: 'Why we migrated 400 services off US hyperscalers', score: 389, comments: 312 },
    { title: 'LLM agents found 12 zero-days in our codebase', score: 367, comments: 178 },
    { title: 'Germany open-sources its public administration suite', score: 322, comments: 145 },
    { title: 'A deep dive into the Ivanti exploit chain', score: 287, comments: 96 },
    { title: 'Running inference on-premises: a cost analysis', score: 241, comments: 88 },
  ].map((it) => ({ ...it, link: '#' }));

  const germany = [
    { title: 'Bundeskabinett beschließt Nachtragshaushalt für Digitalisierung', topline: 'Haushalt', date: iso(0, 11) },
    { title: 'Innenministerkonferenz berät über Schutz kritischer Infrastruktur', topline: 'IMK', date: iso(0, 9) },
    { title: 'Cyberangriff auf Kommunalverwaltung: Ermittlungen laufen', topline: 'Cybersicherheit', date: iso(0, 8) },
    { title: 'Bundestag debattiert über KI-Einsatz in Behörden', topline: 'Digitalpolitik', date: iso(1, 16) },
    { title: 'Neue Cybersicherheitsagenda des BMI vorgestellt', topline: 'BMI', date: iso(1, 12) },
    { title: 'Digitalministerium legt Bericht zur Verwaltungsmodernisierung vor', topline: 'Verwaltung', date: iso(1, 10) },
    { title: 'Länder fordern mehr Bundesmittel für IT-Sicherheit', topline: 'Föderalismus', date: iso(2, 14) },
    { title: 'Glasfaserausbau erreicht 60-Prozent-Marke', topline: 'Infrastruktur', date: iso(2, 9) },
  ].map((it) => ({ ...it, link: '#', source: 'Tagesschau' }));

  const world = [
    { title: 'EU-Gipfel: Einigung auf gemeinsame Cyberabwehr-Kapazitäten', topline: 'Brüssel', date: iso(0, 12) },
    { title: 'NATO meldet Zunahme hybrider Angriffe auf Mitgliedstaaten', topline: 'NATO', date: iso(0, 10) },
    { title: 'USA und EU vereinbaren Rahmen für KI-Sicherheitsstandards', topline: 'Transatlantik', date: iso(0, 7) },
    { title: 'Großangelegter Stromausfall nach Cyberangriff in Südosteuropa', topline: 'Energie', date: iso(1, 18) },
    { title: 'UN-Ausschuss verabschiedet Resolution zu staatlichen Cyberoperationen', topline: 'UN', date: iso(1, 13) },
    { title: 'Chipfertigung: Neue Fabriken in Europa nehmen Betrieb auf', topline: 'Halbleiter', date: iso(2, 11) },
    { title: 'Unterseekabel beschädigt: Ostsee-Anrainer ermitteln', topline: 'Infrastruktur', date: iso(2, 8) },
    { title: 'G7 beraten über Regulierung autonomer KI-Agenten', topline: 'G7', date: iso(3, 15) },
  ].map((it) => ({ ...it, link: '#', source: 'Tagesschau' }));

  const advisoryTimeline = [];
  for (let i = 13; i >= 0; i--) {
    advisoryTimeline.push({
      date: dateKey(i),
      certBund: 3 + ((i * 7) % 9),
      kev: (i * 5) % 4,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    demo: true,
    threatLevel: {
      level: 3,
      label: 'Orange – Hoch',
      reason: 'Deutlich erhöhte aktive Ausnutzung kritischer Schwachstellen (Demo)',
    },
    kpis: {
      cveTotal7d: 612,
      cveCritical7d: 38,
      cveHigh7d: 154,
      kev7d: 6,
      kev30d: 19,
      ransomwareKev30d: 5,
      certBund7d: 47,
      bsiCsw7d: 4,
    },
    charts: {
      cveSeverity: { CRITICAL: 38, HIGH: 154, MEDIUM: 261, LOW: 47, NONE: 112 },
      advisoryTimeline,
      kevTopVendors: [
        { vendor: 'Microsoft', count: 9 },
        { vendor: 'Ivanti', count: 7 },
        { vendor: 'Cisco', count: 6 },
        { vendor: 'Apple', count: 5 },
        { vendor: 'VMware', count: 4 },
        { vendor: 'Fortinet', count: 4 },
        { vendor: 'Google', count: 3 },
        { vendor: 'Adobe', count: 2 },
      ],
    },
    lists: {
      certBund,
      euAdvisories: [
        { title: '2026-042: Critical Vulnerability in Ivanti Connect Secure', source: 'CERT-EU', date: iso(0, 8), link: '#' },
        { title: '2026-041: Multiple Vulnerabilities in Cisco Products', source: 'CERT-EU', date: iso(1), link: '#' },
        { title: '2026-040: Privilege Escalation in Linux Kernel', source: 'CERT-EU', date: iso(2), link: '#' },
        { title: '2026-039: RCE in Microsoft Exchange', source: 'CERT-EU', date: iso(3), link: '#' },
      ],
      securityNews,
      techNews,
      aiNews,
      hackerNews,
      germany,
      world,
      serviceStatus: [
        { name: 'GitHub', indicator: 'none', description: 'All Systems Operational' },
        { name: 'Cloudflare', indicator: 'none', description: 'All Systems Operational' },
        { name: 'npm', indicator: 'none', description: 'All Systems Operational' },
        { name: 'Vercel', indicator: 'minor', description: 'Partially Degraded Service' },
        { name: 'Zoom', indicator: 'none', description: 'All Systems Operational' },
        { name: 'OpenAI', indicator: 'major', description: 'Partial Outage' },
        { name: 'Anthropic', indicator: 'none', description: 'All Systems Operational' },
        { name: 'Slack', indicator: 'none', description: '' },
      ],
      dwd: {
        total: 3,
        severe: 1,
        worst: 'Severe',
        events: [
          'Amtliche WARNUNG vor SCHWEREN STURMBÖEN',
          'Amtliche WARNUNG vor GEWITTER',
          'Amtliche WARNUNG vor STARKREGEN',
        ],
      },
      civilProtection: [
        { title: 'Stromausfall in Teilen von Berlin-Spandau: Netzbetreiber arbeitet an Behebung', provider: 'KATWARN', severity: 'Severe', date: iso(0, 6) },
        { title: 'Bundesweiter Warntag: Probewarnung des BBK', provider: 'MOWAS', severity: 'Minor', date: iso(0, 11) },
        { title: 'Polizeieinsatz Berlin-Mitte: Bereich um den Hauptbahnhof meiden', provider: 'POLIZEI', severity: 'Moderate', date: iso(0, 9) },
      ],
      energy: { renShare: 64.2, signal: 2, loadGw: 58.4 },
      weather: {
        temp: 21.4,
        feels: 20.1,
        humidity: 58,
        precip: 0.3,
        code: 80,
        windKmh: 18,
        gustKmh: 41,
        windDir: 240,
        pressure: 1013.2,
        cloud: 65,
        tmax: 24.1,
        tmin: 13.6,
        sunrise: new Date().toISOString().slice(0, 10) + 'T04:43',
        sunset: new Date().toISOString().slice(0, 10) + 'T21:28',
      },
      cloudflare: { outages24h: 9, outagesDe: 0, ddosTrendPct: 23 },
      socialTrends: [
        { tag: 'ZeroDay', count: 4100, source: 'infosec.exchange', cto: true },
        { tag: 'KRITIS', count: 3400, source: 'mastodon.social', cto: true },
        { tag: 'Ivanti', count: 2850, source: 'infosec.exchange', cto: true },
        { tag: 'AIAct', count: 2100, source: 'mastodon.social', cto: true },
        { tag: 'Ransomware', count: 1760, source: 'infosec.exchange', cto: true },
        { tag: 'OpenSource', count: 1450, source: 'mastodon.social', cto: true },
        { tag: 'Verwaltungscloud', count: 980, source: 'mastodon.social', cto: true },
        { tag: 'PostQuantum', count: 540, source: 'infosec.exchange', cto: true },
        { tag: 'CCC', count: 480, source: 'chaos.social', cto: true },
        { tag: 'SelfHosting', count: 420, source: 'fosstodon.org', cto: true },
        { tag: 'Cyberabwehr EU', count: null, source: 'Bluesky', cto: true },
        { tag: 'KI in Behörden', count: null, source: 'Bluesky', cto: true },
        { tag: 'Souveräne Cloud', count: null, source: 'Bluesky', cto: true },
      ],
    },
    sources: [
      { id: 'demo', name: 'Demo-Modus – alle Daten sind Beispieldaten', ok: true, stale: false, fetchedAt: new Date().toISOString(), error: null },
    ],
  };
}

module.exports = { buildDemoDashboard };
