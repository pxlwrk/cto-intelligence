'use strict';

/**
 * Feste Termine und Fristen mit Bezug zu Digitalpolitik und IT-Sicherheit.
 * Diese Liste wird bewusst von Hand gepflegt, weil es dafür keine
 * verlässliche öffentliche Schnittstelle gibt. Bitte regelmäßig gegen die
 * amtlichen Quellen prüfen und anpassen. Vergangene Termine blenden
 * Dashboard und API automatisch aus.
 *
 * date: ISO-Datum (YYYY-MM-DD), title: Kurzbezeichnung,
 * note: eine Zeile Erklärung in einfacher Sprache.
 */
const DEADLINES = [
  {
    date: '2026-12-31',
    title: 'EU-Wallet für digitale Identität (eIDAS 2.0)',
    note: 'Jeder Mitgliedstaat muss seinen Bürgern eine digitale Identitäts-Wallet anbieten.',
  },
  {
    date: '2026-12-31',
    title: 'Start Umstieg auf Post-Quanten-Kryptografie',
    note: 'EU-Fahrplan: Migrationsplanung und erste Pilotprojekte sollen bis Ende 2026 laufen.',
  },
  {
    date: '2027-08-02',
    title: 'EU AI Act: Hochrisiko-KI in regulierten Produkten',
    note: 'Pflichten für KI in Produkten nach EU-Harmonisierungsrecht. Der Zeitplan kann sich durch das Digital-Omnibus-Paket noch ändern.',
  },
  {
    date: '2027-12-11',
    title: 'Cyber Resilience Act: volle Anwendung',
    note: 'Produkte mit digitalen Elementen brauchen dann CE-Kennzeichnung und Sicherheitsupdates über den Lebenszyklus.',
  },
  {
    date: '2030-12-31',
    title: 'Post-Quanten-Kryptografie in kritischen Systemen',
    note: 'EU-Fahrplan: Hochrisiko-Anwendungen und kritische Infrastrukturen sollen bis 2030 umgestellt sein.',
  },
];

/** Kommende Fristen mit verbleibenden Tagen, nächste zuerst. */
function upcomingDeadlines(limit = 5, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return DEADLINES.map((d) => {
    const [y, m, day] = d.date.split('-').map(Number);
    return { ...d, daysLeft: Math.round((Date.UTC(y, m - 1, day) - today) / 86400000) };
  })
    .filter((d) => d.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, limit);
}

module.exports = { DEADLINES, upcomingDeadlines };
