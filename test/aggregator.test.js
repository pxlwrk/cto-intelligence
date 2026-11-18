'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _internals: i } = require('../src/aggregator');
const { upcomingDeadlines } = require('../src/regulatory-calendar');

const dayKey = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

test('KEV-Wochenreihe zählt Neuzugänge und Ransomware je Kalenderwoche', () => {
  const kev = [
    { dateAdded: dayKey(0), ransomware: true },
    { dateAdded: dayKey(0) },
    { dateAdded: dayKey(400) }, // außerhalb des Fensters
  ];
  const weekly = i.buildKevWeekly(kev, 12);
  assert.equal(weekly.length, 12);
  const current = weekly[weekly.length - 1];
  assert.equal(current.kev, 2);
  assert.equal(current.ransomware, 1);
  assert.equal(weekly.reduce((sum, w) => sum + w.kev, 0), 2);
});

test('Vorperioden-Zählung trennt die Zeitfenster sauber', () => {
  const kev = [
    { dateAdded: dayKey(2), ransomware: true },
    { dateAdded: dayKey(9) },
    { dateAdded: dayKey(40), ransomware: true },
  ];
  assert.equal(i.countKevBetween(kev, 7, 0), 1);
  assert.equal(i.countKevBetween(kev, 14, 7), 1);
  assert.equal(i.countKevBetween(kev, 60, 30, true), 1);
});

test('Regulierungsthemen werden erkannt und Treffer dedupliziert', () => {
  assert.equal(i.regulationTopic('Bundestag beschließt NIS2-Umsetzung'), 'NIS2 / KRITIS');
  assert.equal(i.regulationTopic('Neues Smartphone vorgestellt'), null);
  const item = { title: 'EU AI Act tritt in Kraft', date: new Date().toISOString() };
  const result = i.buildRegulation([[item], [item, { title: 'Wetter morgen' }]]);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.topics, [{ topic: 'KI-Regulierung', count: 1 }]);
});

test('Zusammenfassung lässt fehlende Daten weg statt sie zu erfinden', () => {
  const summary = i.buildSummary({
    threat: { level: 2 },
    kpis: { kev7d: null, ransomwareKev30d: null },
    kpiPrev: {},
    zdc: null,
    services: { known: 0, disrupted: 0, names: [] },
  });
  assert.equal(summary.bullets.length, 0);
  assert.ok(summary.headline && summary.action);
});

test('Fristen: Vergangenes entfällt, Rest ist aufsteigend sortiert', () => {
  const list = upcomingDeadlines(10, new Date('2027-06-01T00:00:00Z'));
  assert.ok(list.every((d) => d.daysLeft >= 0));
  assert.deepEqual(list.map((d) => d.daysLeft), [...list.map((d) => d.daysLeft)].sort((a, b) => a - b));
  assert.ok(list.length < 5);
});

test('Ohne Lagedaten meldet die Zusammenfassung eine unvollständige Lage', () => {
  const summary = i.buildSummary({
    threat: { level: 0 },
    kpis: {},
    kpiPrev: {},
    zdc: null,
    services: { known: 0, disrupted: 0, names: [] },
  });
  assert.match(summary.headline, /unvollständig/);
  assert.equal(summary.bullets.length, 0);
});
