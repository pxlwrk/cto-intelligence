'use strict';

/**
 * Vercel Serverless Function: GET /api/dashboard
 *
 * Statt des In-Memory-Caches des lokalen Servers übernimmt hier das
 * Vercel-CDN das Caching (s-maxage) – Funktionsinstanzen sind kurzlebig,
 * warme Instanzen profitieren zusätzlich vom Aggregator-Cache.
 */
const { buildDashboard } = require('../src/aggregator');
const { buildDemoDashboard } = require('../src/demo-data');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const data = process.env.DEMO === '1' ? buildDemoDashboard() : await buildDashboard();
    // 5 min CDN-Cache, bis 30 min wird Veraltetes sofort ausgeliefert und
    // im Hintergrund erneuert – deckt sich mit dem 5-min-Refresh des Frontends.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('Dashboard-Aggregation fehlgeschlagen:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Aggregation fehlgeschlagen', detail: err.message }));
  }
};
