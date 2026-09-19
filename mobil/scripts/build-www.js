// www/ derleme betiği: Capacitor webDir'i (dist/) website/ klasöründeki statik dosyalardan üretir.
// Kullanım: mobil/ klasöründen  ->  npm run cap:sync   veya   node scripts/build-www.js
const fs = require('fs');
const path = require('path');

const mobilRoot = path.resolve(__dirname, '..');          // mobil/
const projectRoot = path.resolve(mobilRoot, '..');        // depo kökü
const site = path.join(projectRoot, 'website');           // website/
const dist = path.join(mobilRoot, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'js'), { recursive: true });
fs.mkdirSync(path.join(dist, 'css'), { recursive: true });
fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });

const files = [
  ['index.html', 'index.html'],
  ['css/style.css', 'css/style.css']
];

// website/js altındaki TÜM modülleri kopyala (app, ai, tts, memory, storage, media...)
for (const name of fs.readdirSync(path.join(site, 'js'))) {
  if (name.endsWith('.js')) files.push(['js/' + name, 'js/' + name]);
}

for (const [src, dest] of files) {
  fs.copyFileSync(path.join(site, src), path.join(dist, dest));
  console.log('kopyalandı:', dest);
}

// assets/ altındaki her şeyi kopyala
function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
copyDir(path.join(site, 'assets'), path.join(dist, 'assets'));

console.log('dist/ hazır ✓');
