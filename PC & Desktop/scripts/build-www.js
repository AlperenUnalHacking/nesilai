// app/ derleme betiği: Electron'un göstereceği site dosyalarını website/'dan kopyalar.
// Kullanım: "PC & Desktop" klasöründen  ->  npm run build-www   (veya npm start)
const fs = require('fs');
const path = require('path');

const desktopRoot = path.resolve(__dirname, '..');          // PC & Desktop/
const projectRoot = path.resolve(desktopRoot, '..');        // depo kökü
const site = path.join(projectRoot, 'website');             // website/
const appDir = path.join(desktopRoot, 'app');

fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(path.join(appDir, 'js'), { recursive: true });
fs.mkdirSync(path.join(appDir, 'css'), { recursive: true });
fs.mkdirSync(path.join(appDir, 'assets'), { recursive: true });

const files = [
    ['index.html', 'index.html'],
    ['css/style.css', 'css/style.css']
];

// website/js altındaki TÜM modüller
for (const name of fs.readdirSync(path.join(site, 'js'))) {
    if (name.endsWith('.js')) files.push(['js/' + name, 'js/' + name]);
}

for (const [src, dest] of files) {
    fs.copyFileSync(path.join(site, src), path.join(appDir, dest));
    console.log('kopyalandı:', dest);
}

// assets/ altındaki her şey
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
copyDir(path.join(site, 'assets'), path.join(appDir, 'assets'));

console.log('app/ hazır OK');
