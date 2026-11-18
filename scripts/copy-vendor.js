'use strict';

// Kopiert Chart.js und die Schriftdateien aus node_modules nach public/vendor,
// damit das Frontend sowohl lokal als auch auf Vercel (statisches public/-
// Verzeichnis) ohne CDN auskommt. Läuft als build-/prestart-Script.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const pub = (...p) => path.join(root, 'public', 'vendor', ...p);

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`${path.relative(root, src)} -> ${path.relative(root, dest)}`);
}

copy(nm('chart.js', 'dist', 'chart.umd.js'), pub('chartjs', 'chart.umd.js'));

const fonts = [
  ['@fontsource/inter', 'inter', [400, 500, 600, 700]],
  ['@fontsource/jetbrains-mono', 'jetbrains-mono', [400, 700]],
];
for (const [pkg, name, weights] of fonts) {
  for (const w of weights) {
    const file = `${name}-latin-${w}-normal.woff2`;
    copy(nm(pkg, 'files', file), pub('fonts', file));
  }
}
