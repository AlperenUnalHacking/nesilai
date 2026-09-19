// NesilAI Masaüstü — Electron ana süreç
// website/ klasöründen derlenen app/ içeriğini uygulama penceresinde gösterir.
const { app, BrowserWindow, shell, Menu, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
    const iconPath = path.join(__dirname, 'icon.png');
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 480,
        minHeight: 400,
        title: 'NesilAI',
        // Logo hem görev çubuğunda hem pencere ikonu olarak görünür
        icon: require('fs').existsSync(iconPath) ? iconPath : undefined,
        autoHideMenuBar: true,
        backgroundColor: '#0a0a0d',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    // Başlık değişimini sabitle (sayfa kendi başlığını yazıyor, sorun değil ama tutarlı olsun)
    win.on('page-title-updated', (e) => e.preventDefault());

    // Dış bağlantılar (Bloodline linki vb.) varsayılan tarayıcıda açılır
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    win.loadFile(path.join(__dirname, 'app', 'index.html'));
}

app.whenReady().then(() => {
    // Uygulama menüsünü kaldır — temiz arayüz
    Menu.setApplicationMenu(null);
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
