'use strict';

// Kopiert Chart.js aus node_modules nach public/vendor, damit das Frontend
// sowohl lokal als auch auf Vercel (statisches public/-Verzeichnis) ohne
// CDN auskommt. Läuft als build-/prestart-Script.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js');
const dest = path.join(__dirname, '..', 'public', 'vendor', 'chartjs', 'chart.umd.js');

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Chart.js nach ${path.relative(process.cwd(), dest)} kopiert.`);
