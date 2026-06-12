'use strict';

const path = require('path');
const express = require('express');
const { buildDashboard } = require('./src/aggregator');
const { buildDemoDashboard } = require('./src/demo-data');

const PORT = process.env.PORT || 3000;
const DEMO = process.env.DEMO === '1';

const app = express();
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname, 'public')));
app.use(
  '/vendor/chartjs',
  express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist'))
);

let inflight = null;

app.get('/api/dashboard', async (req, res) => {
  // Kein Zwischenspeichern durch Browser oder Proxys – Aktualität geht vor
  res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  if (DEMO) return res.json(buildDemoDashboard());
  try {
    // Gleichzeitige Anfragen teilen sich einen Aggregationslauf.
    inflight = inflight || buildDashboard().finally(() => (inflight = null));
    res.json(await inflight);
  } catch (err) {
    console.error('Dashboard-Aggregation fehlgeschlagen:', err);
    res.status(500).json({ error: 'Aggregation fehlgeschlagen', detail: err.message });
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true, demo: DEMO }));

// Beim Vercel-Deployment wird die App aus api/dashboard.js heraus genutzt;
// lokal startet `node server.js` den Server direkt.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CTO-Intelligence-Dashboard läuft auf http://localhost:${PORT}${DEMO ? ' (DEMO-MODUS)' : ''}`);
  });
}

module.exports = app;
