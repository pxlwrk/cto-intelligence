'use strict';

/**
 * Vercel Serverless Function: GET /api/dashboard
 *
 * Bewusst KEIN CDN-/Proxy-Caching (no-store): Zwischenspeicher (Vercel-CDN,
 * Behörden-Proxys) haben sonst veraltete Stände ausgeliefert. Das Caching
 * der Quellen übernimmt allein der In-Memory-Cache des Aggregators, der
 * auf warmen Funktionsinstanzen erhalten bleibt.
 */
const { buildDashboard } = require('../src/aggregator');
const { buildDemoDashboard } = require('../src/demo-data');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  try {
    const data = process.env.DEMO === '1' ? buildDemoDashboard() : await buildDashboard();
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error('Dashboard-Aggregation fehlgeschlagen:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Aggregation fehlgeschlagen', detail: err.message }));
  }
};
