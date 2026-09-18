/* ========================================================
   NesilAI — Proje Dosyası Üretici (projectfiles.js)
   --------------------------------------------------------
   "Bir proje yap" isteklerinde yapay zekanın verdiği dosya
   bloklarını (```dosya: yolu``` veya ```path: yolu```
   başlıklı kod blokları) ayrıştırır; sohbet kartı içinde
   dosya ağacı + indirme butonları gösterir.
   Tek dosya → doğrudan indirir. Çok dosya → JSZip ile zip.
   ======================================================== */
(function () {
    'use strict';

    // --------------------------------------------------------
    // Ayrıştırma: ```lang dosya: app.js``` veya ```lang path: a/b.js```
    // Hem ``` fenced bloklarını hem de **app.js** başlıklı blokları destekler
    // --------------------------------------------------------
    function parseFileBlocks(text) {
        const files = [];
        if (!text) return files;
        const re = /```([a-zA-Z0-9_\-\.]*)[ \t]*([^\n\r`]{0,120})\r?\n([\s\S]*?)```/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const lang = (m[1] || '').trim();
            const header = (m[2] || '').trim();
            const body = m[3];

            // Başlıkta dosya yolu var mı? (dosya:, path:, filename:, dosya adı)
            const pm = header.match(/(?:dosya|path|filename|file|dosya adı)\s*[:=]\s*(.+)/i);
            let name = pm ? pm[1].trim() : '';
            if (!name && /^[^\s]+\.[a-z0-9]{1,8}$/i.test(header)) {
                // Başlık doğrudan dosya adı: "index.html"
                name = header;
            }
            if (!name && files.length === 0 && !lang && !header) continue;

            if (name) {
                files.push({ name: sanitizeName(name), lang: lang, content: body });
            }
        }

        // Alternatif biçim: "**app.js**" kalın başlıktan sonraki blok
        if (files.length === 0) {
            const re2 = /(?:^|\n)\s*\*\*([^*\n]{1,80}?\.[a-zA-Z0-9]{1,8})\*\*\s*:?\s*\n+```[a-zA-Z0-9_\-\.]*\r?\n([\s\S]*?)```/g;
            while ((m = re2.exec(text)) !== null) {
                files.push({ name: sanitizeName(m[1].trim()), lang: '', content: m[2] });
            }
        }

        // Son çare: ```html ve ```css blokları proje şablonuna dönüştür
        if (files.length === 0) {
            const htmlBlock = text.match(/```html\r?\n([\s\S]*?)```/);
            const cssBlock = text.match(/```css\r?\n([\s\S]*?)```/);
            if (htmlBlock && cssBlock) {
                files.push({ name: 'index.html', lang: 'html', content: htmlBlock[1] });
                files.push({ name: 'style.css', lang: 'css', content: cssBlock[1] });
            }
        }

        return files;
    }

    function sanitizeName(name) {
        let n = String(name).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').trim();
        if (n.length > 80) n = n.slice(0, 80);
        if (!n) n = 'dosya.txt';
        // İlk segment yerine ./ ../ temizle
        return n.replace(/^\.+/, '');
    }

    // --------------------------------------------------------
    // Blob yardımcıları
    // --------------------------------------------------------
    function contentToBlob(content) {
        return new Blob([content], { type: 'text/plain;charset=utf-8' });
    }

    function download(name, blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    // --------------------------------------------------------
    // Zip: JSZip yüklüyse kullan; yoksa tek tek indir
    // --------------------------------------------------------
    async function downloadAll(files) {
        if (files.length === 1) {
            download(files[0].name, contentToBlob(files[0].content));
            return 'indirildi';
        }
        if (window.JSZip) {
            const zip = new window.JSZip();
            files.forEach(f => zip.file(f.name, f.content));
            const blob = await zip.generateAsync({ type: 'blob' });
            download('nesilai-proje-' + Date.now() + '.zip', blob);
            return 'zip';
        }
        // JSZip yok: küçük aralıkla sırayla indir
        for (let i = 0; i < files.length; i++) {
            setTimeout(() => download(files[i].name, contentToBlob(files[i].content)), i * 350);
        }
        return 'sirali';
    }

    // --------------------------------------------------------
    // Sohbet kartı: dosya ağacı + eylem butonları
    // --------------------------------------------------------
    function renderProjectCard(container, msg) {
        const files = msg._files || parseFileBlocks(msg.text);
        if (!files.length) return false;

        const card = document.createElement('div');
        card.className = 'project-files-card';

        const head = document.createElement('div');
        head.className = 'project-files-head';
        head.innerHTML = '<span class="pfc-icon">🗂️</span><span>Proje dosyaları <b>' +
            files.length + ' dosya</b> — hazır</span>';
        card.appendChild(head);

        const tree = document.createElement('div');
        tree.className = 'project-files-tree';
        files.forEach(f => {
            const row = document.createElement('div');
            row.className = 'project-file-row';

            const icon = document.createElement('span');
            icon.className = 'pfile-icon';
            icon.textContent = fileIcon(f.name);

            const label = document.createElement('span');
            label.className = 'pfile-name';
            label.textContent = f.name;

            const size = document.createElement('span');
            size.className = 'pfile-size';
            size.textContent = formatBytes(f.content.length);

            const dl = document.createElement('button');
            dl.className = 'pfile-dl';
            dl.title = 'İndir';
            dl.textContent = '⬇';
            dl.addEventListener('click', () => download(f.name, contentToBlob(f.content)));

            row.appendChild(icon); row.appendChild(label); row.appendChild(size); row.appendChild(dl);
            tree.appendChild(row);
        });
        card.appendChild(tree);

        const actions = document.createElement('div');
        actions.className = 'project-files-actions';
        const allBtn = document.createElement('button');
        allBtn.className = 'btn-action-pill primary';
        allBtn.innerHTML = '<span>📦</span> <span>Tümünü indir (zip)</span>';
        allBtn.addEventListener('click', async () => {
            allBtn.disabled = true;
            const mode = await downloadAll(files);
            allBtn.innerHTML = mode === 'zip'
                ? '<span>✅</span> <span>Zip indirildi</span>'
                : '<span>✅</span> <span>Dosyalar indirildi</span>';
            setTimeout(() => {
                allBtn.innerHTML = '<span>📦</span> <span>Tümünü indir (zip)</span>';
                allBtn.disabled = false;
            }, 2500);
        });
        actions.appendChild(allBtn);
        card.appendChild(actions);

        container.appendChild(card);
        return true;
    }

    function fileIcon(name) {
        if (/\.html?$/i.test(name)) return '🌐';
        if (/\.css$/i.test(name)) return '🎨';
        if (/\.m?js$/i.test(name)) return '📜';
        if (/\.json$/i.test(name)) return '🧩';
        if (/\.md$/i.test(name)) return '📝';
        if (/\.py$/i.test(name)) return '🐍';
        if (/\.(png|jpe?g|svg|gif)$/i.test(name)) return '🖼️';
        return '📄';
    }

    function formatBytes(n) {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
    }

    window.NesilProjectFiles = {
        parseFileBlocks,
        renderProjectCard,
        downloadAll,
        download
    };
})();
