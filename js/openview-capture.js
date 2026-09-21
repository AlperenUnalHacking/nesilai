/* ========================================================
   NesilAI — OpenView Çekirdek Katmanı
   --------------------------------------------------------
   ScreenCapture  → getDisplayMedia bağlantısı, talep-bazlı kare yakalama
   ScreenSelector → donmuş kare üzerinde bölge seçimi
   VisionAnalyzer → ölçekleme + AI.chat (vision) + OCR yedeği

   Bu dosya platformun mevcut AI katmanını (NesilAI.chat) kullanır;
   kendi model çağrısını yapmaz. OpenView arayüzü js/openview.js'tedir.
   ======================================================== */
(function () {
    'use strict';

    // ========================================================
    // 0. Platform Kapısı — OpenView yalnızca PC / masaüstünde
    // ========================================================
    const bridge = window.nesilaiDesktop || null; // Electron preload köprüsü
    const isElectron = bridge ? !!bridge.isDesktop : /Electron/i.test(navigator.userAgent);
    const isMobileLike = !!window.Capacitor ||
        /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
    const hasCaptureApi = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    const isDesktopPlatform = hasCaptureApi && !isMobileLike;

    const PC_ONLY_MESSAGE = '🚫 **OpenView yalnızca PC sürümünde kullanılabilir.** ' +
        'Mobil ve tablet sürümlerde bu özellik bulunmaz. Bilgisayar uygulamasında ' +
        'ya da masaüstü tarayıcıda `/openview` yazarak kullanabilirsin.';

    // ========================================================
    // 1. Ayarlar — localStorage'da kalıcı
    // ========================================================
    const SETTINGS_KEY = 'nesilai_openview_v1';

    const DEFAULT_SETTINGS = {
        screenQuality: 'balanced',   // fast | balanced | detailed | native
        jpegQuality: 0.72,           // 0.4 – 0.95
        hidePanelOnCapture: true,    // yakalama sırasında panel gizlenir
        voiceReply: false,           // AI sesli yanıt (NesilTTS)
        micEnabled: true,            // mikrofon kullanımı
        monitorId: null,             // Electron: seçili monitör (display id)
        panelSize: 'normal',         // compact | normal | wide
        panelOpacity: 0.82,          // 0.55 – 0.95
        panelCorner: 'left',         // left | right
        panelPos: null,              // sürüklenmişse {left, top} — serbest konum
        overlayMode: false,          // Electron: şeffaf, tık-geçiren overlay penceresi
        autoStart: false,            // uygulama açılışında OpenView'ı aç
        shortcut: 'Ctrl+Shift+O'     // off | Alt+O | Ctrl+Alt+O | Ctrl+Shift+O
    };

    function loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
            return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
        } catch (e) {
            return Object.assign({}, DEFAULT_SETTINGS);
        }
    }

    const settings = loadSettings();

    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) { /* kota dolu olabilir — sessiz geç */ }
    }

    // Ekran analizi çözünürlüğü — "düşük maliyet" hedefi: kare yalnızca
    // soru sorulduğunda alınır ve modele gitmeden önce ölçeklenir.
    const QUALITY_MAX_DIM = {
        fast: 1280,
        balanced: 1600,
        detailed: 2200,
        native: Infinity
    };

    // ========================================================
    // 2. ScreenCapture — canlı ekran bağlantısı
    // --------------------------------------------------------
    // Performans ilkesi: ekran SÜREKLİ modele gönderilmez. Stream yalnızca
    // bağlantı kurmak için açılır; kare, kullanıcı sorduğu anda tek seferlik
    // canvas'a çizilir ve JPEG'e çevrilir. Video bekleme sırasında duraklatılır
    // → düşük CPU, düşük gecikme, düşük API maliyeti.
    // ========================================================
    let screenConnected = null;   // dış callback (openview.js atar)
    let screenDisconnected = null;

    const ScreenCapture = {
        stream: null,
        video: null,

        isActive() {
            const s = this.stream;
            return !!(s && s.getVideoTracks().some(t => t.readyState === 'live'));
        },

        async start() {
            if (this.isActive()) return;
            if (!hasCaptureApi) {
                throw new Error('Bu ortam ekran paylaşımını desteklemiyor.');
            }

            // Electron köprüsü varsa monitör tercihi ana sürece bildirilir;
            // setDisplayMediaRequestHandler bu tercihe göre kaynağı seçer.
            if (bridge && settings.monitorId != null && bridge.setPreferredMonitor) {
                try { await bridge.setPreferredMonitor(settings.monitorId); } catch (e) { /* yoksay */ }
            }

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: { ideal: 8, max: 15 },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            this.stream = stream;

            if (!this.video) {
                this.video = document.createElement('video');
                this.video.muted = true;
                this.video.playsInline = true;
                this.video.setAttribute('aria-hidden', 'true');
                this.video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none;';
                document.body.appendChild(this.video);
            }
            this.video.srcObject = stream;
            try { await this.video.play(); } catch (e) { /* grabFrame yeniden dener */ }

            // Kullanıcı "paylaşımı durdur" dediğinde durumu düşür
            stream.getVideoTracks().forEach(track => {
                track.addEventListener('ended', () => {
                    this.stop();
                    if (screenDisconnected) screenDisconnected();
                });
            });

            if (screenConnected) screenConnected();
        },

        stop() {
            if (this.stream) {
                this.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* yoksay */ } });
                this.stream = null;
            }
            if (this.video) {
                try { this.video.pause(); } catch (e) { /* yoksay */ }
                this.video.srcObject = null;
            }
            if (screenDisconnected) screenDisconnected();
        },

        async ensure() {
            if (!this.isActive()) await this.start();
        },

        /** Tek seferlik kare yakalar → { dataUrl, width, height } (JPEG) */
        async grabFrame() {
            const v = this.video;
            if (!this.isActive() || !v) {
                throw new Error('Ekran bağlı değil.');
            }

            // Duraklatılmış video canlı kare vermeyebilir → kısa süre oynat
            if (v.paused) {
                try { await v.play(); } catch (e) { /* zaten oynuyor olabilir */ }
            }
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            await new Promise(r => setTimeout(r, 90)); // taze karenin gelmesini bekle

            const w = v.videoWidth;
            const h = v.videoHeight;
            if (!w || !h) {
                throw new Error('Ekran görüntüsü alınamadı — paylaşım durdurulmuş olabilir.');
            }

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(v, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', settings.jpegQuality);

            // Bekleme moduna dön — CPU tasarrufu
            try { v.pause(); } catch (e) { /* yoksay */ }

            return { dataUrl: dataUrl, width: w, height: h };
        }
    };

    // ========================================================
    // 3. ScreenSelector — ekran bölgesi seçimi
    // --------------------------------------------------------
    // Yakalama anındaki "donmuş kare" ekranda gösterilir; kullanıcı bu
    // önizleme üzerinde dikdörtgen çizer. Kırpma aynı bitmap üzerinden
    // orantıyla yapılır → piksel hassasiyetinde, monitörden bağımsız.
    // Esc = iptal. Fare bırakıldığında seçim onaylanır.
    // ========================================================
    const ScreenSelector = {
        /**
         * @param {{dataUrl:string,width:number,height:number}} frozen donmuş kare
         * @param {Document} [hostDoc] bindirmenin ekleneceği belge — OpenView PiP
         *   modundayken panel pip penceresinde yaşar; seçici de orada açılmalı
         * @returns {Promise<{dataUrl:string}|null>} null = kullanıcı iptal etti
         */
        open(frozen, hostDoc) {
            const host = hostDoc || document;
            return new Promise(resolve => {
                const overlay = document.createElement('div');
                overlay.className = 'ov-selector';
                overlay.innerHTML =
                    '<div class="ov-selector-hint">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-crop"/></svg>' +
                        '<span>Fare ile analiz edilecek bölgeyi çiz — <b>Esc</b> iptal eder</span>' +
                        '<button type="button" class="ov-selector-cancel">İptal</button>' +
                    '</div>' +
                    '<div class="ov-selector-stage">' +
                        '<img class="ov-selector-img" alt="Ekran önizleme" draggable="false">' +
                        '<div class="ov-selector-rect hidden"><span class="ov-selector-size"></span></div>' +
                    '</div>';

                const img = overlay.querySelector('.ov-selector-img');
                const rectEl = overlay.querySelector('.ov-selector-rect');
                const sizeEl = overlay.querySelector('.ov-selector-size');
                img.src = frozen.dataUrl;

                let startX = 0, startY = 0, drawing = false;
                let settled = false;

                const cleanup = (result) => {
                    if (settled) return;
                    settled = true;
                    host.removeEventListener('keydown', onKey, true);
                    overlay.remove();
                    resolve(result);
                };

                function onKey(e) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        cleanup(null);
                    }
                }
                host.addEventListener('keydown', onKey, true);

                overlay.querySelector('.ov-selector-cancel').addEventListener('click', () => cleanup(null));

                const stage = overlay.querySelector('.ov-selector-stage');

                stage.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    drawing = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    rectEl.classList.remove('hidden');
                    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
                    paint(e.clientX, e.clientY);
                });

                stage.addEventListener('pointermove', (e) => {
                    if (drawing) paint(e.clientX, e.clientY);
                });

                stage.addEventListener('pointerup', (e) => {
                    if (!drawing) return;
                    drawing = false;
                    const box = currentRect(e.clientX, e.clientY);
                    if (box.w < 12 || box.h < 12) {
                        // Çok küçük seçim = yanlışlıkla tıklama → iptal say
                        rectEl.classList.add('hidden');
                        return;
                    }
                    cleanup({ dataUrl: crop(box) });
                });

                function currentRect(cx, cy) {
                    return {
                        x: Math.min(startX, cx),
                        y: Math.min(startY, cy),
                        w: Math.abs(cx - startX),
                        h: Math.abs(cy - startY)
                    };
                }

                function paint(cx, cy) {
                    const box = currentRect(cx, cy);
                    rectEl.style.left = box.x + 'px';
                    rectEl.style.top = box.y + 'px';
                    rectEl.style.width = box.w + 'px';
                    rectEl.style.height = box.h + 'px';
                    sizeEl.textContent = Math.round(box.w) + ' × ' + Math.round(box.h);
                }

                /** Önizleme üzerindeki seçimi, donmuş kare üzerindeki piksellere çevirir */
                function crop(box) {
                    const ir = img.getBoundingClientRect();
                    const scaleX = frozen.width / ir.width;
                    const scaleY = frozen.height / ir.height;
                    const sx = Math.max(0, Math.round((box.x - ir.left) * scaleX));
                    const sy = Math.max(0, Math.round((box.y - ir.top) * scaleY));
                    const sw = Math.max(1, Math.min(frozen.width - sx, Math.round(box.w * scaleX)));
                    const sh = Math.max(1, Math.min(frozen.height - sy, Math.round(box.h * scaleY)));

                    const canvas = document.createElement('canvas');
                    canvas.width = sw;
                    canvas.height = sh;
                    const ctx = canvas.getContext('2d');

                    const source = new Image();
                    source.src = frozen.dataUrl;
                    try {
                        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
                    } catch (e) { /* yoksay — boş kare döner */ }
                    return canvas.toDataURL('image/jpeg', settings.jpegQuality);
                }

                host.body.appendChild(overlay);
            });
        }
    };

    // ========================================================
    // 4. VisionAnalyzer — görüntü analizi (mevcut AI katmanıyla)
    // --------------------------------------------------------
    // Vision destekli sağlayıcıda görüntü doğrudan modele gider.
    // Desteklemiyorsa OCR (NesilP2T / Tesseract) yedeği devreye girer:
    // ekrandaki metin okunur ve metin-temelli soru sorulur — model
    // görmediği şeyleri görüyormuş gibi davranamaz.
    // ========================================================
    const VISION_SYSTEM_PROMPT = [
        'Sen NesilAI\'ın "OpenView" ekran asistanısın: kullanıcının bilgisayar ekranının ekran görüntüsü sana verilir.',
        'KURALLAR:',
        '- Yanıtını YALNIZCA verilen ekran görüntüsünde gerçekten görünen bilgilere dayandır.',
        '- Görüntüde görünmeyen bir şey sorulursa bunu açıkça söyle: "Bu alan görüntüde görünmediği için kesin olarak söyleyemiyorum."',
        '- Görüntüdeki metinleri oku (başlıklar, hata mesajları, kod, arayüz metinleri).',
        '- Ekran düzenini ve görünür uygulama/pencere türlerini tanımla.',
        '- Ekran görüntüsü tek bir anlık karedir; geçmiş kareleri görmedin, video oynatıyor olabileceğini bil.',
        '- Kısa ve doğrudan yanıt ver; kullanıcının dilinde yaz (varsayılan Türkçe).'
    ].join('\n');

    const VisionAnalyzer = {
        supportsVision() {
            const ai = window.NesilAI;
            if (!ai || !ai.getProvider) return false;
            const provider = ai.getProvider();
            return !!(provider && provider.vision);
        },

        /** Kareyi kalite ayarına göre ölçekler → { dataUrl, mimeType } */
        async prepare(dataUrl) {
            const maxDim = QUALITY_MAX_DIM[settings.screenQuality] || QUALITY_MAX_DIM.balanced;
            if (maxDim === Infinity) {
                return { dataUrl: dataUrl, mimeType: 'image/jpeg' };
            }
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                    if (scale >= 1) {
                        resolve({ dataUrl: dataUrl, mimeType: 'image/jpeg' });
                        return;
                    }
                    const w = Math.max(1, Math.round(img.width * scale));
                    const h = Math.max(1, Math.round(img.height * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve({ dataUrl: canvas.toDataURL('image/jpeg', settings.jpegQuality), mimeType: 'image/jpeg' });
                };
                img.onerror = () => resolve({ dataUrl: dataUrl, mimeType: 'image/jpeg' });
                img.src = dataUrl;
            });
        },

        /**
         * Screenshot + soru → AI streaming yanıtı.
         * @param {object} o { imageDataUrl, question, onDelta, signal, history }
         * @returns {Promise<{text:string}>|string} tam yanıt metni
         */
        async analyze(o) {
            const opts = o || {};
            const prepared = await this.prepare(opts.imageDataUrl);

            if (this.supportsVision()) {
                return window.NesilAI.chat({
                    messages: [{
                        role: 'user',
                        content: opts.question + '\n\n(Eklenen görüntü: kullanıcının ekran görüntüsü. Yalnızca bu görüntüde görünen bilgilere dayan; görmediğin şeyleri ekrandaymış gibi uydurma.)',
                        images: [{ dataUrl: prepared.dataUrl, mimeType: prepared.mimeType }]
                    }],
                    system: VISION_SYSTEM_PROMPT,
                    onDelta: opts.onDelta,
                    signal: opts.signal
                });
            }

            // Vision yok → OCR yedeği
            return this.analyzeViaOcr(prepared.dataUrl, opts.question, opts.onDelta, opts.signal);
        },

        async analyzeViaOcr(dataUrl, question, onDelta, signal) {
            let ocrText = '';
            if (window.NesilP2T && window.NesilP2T.isSupported()) {
                try {
                    ocrText = await window.NesilP2T.extractText(dataUrl, null) || '';
                } catch (e) { /* OCR başarısız — yine de sor */ }
            }

            const lines = [
                'Ekrandaki içerik hakkında soru: ' + question,
                '',
                'Ekran görüntüsünden okunan metin (OCR):'
            ];
            if (ocrText) {
                lines.push(ocrText.slice(0, 4000));
            } else {
                lines.push('(OCR metin okuyamadı — muhtemelen görüntü ağırlıklı içerik.)');
            }
            lines.push('', 'Bu bilgilere dayanarak yanıt ver. OCR\'da geçmeyen ayrıntılar hakkında kesin konuşma.');

            return window.NesilAI.chat({
                messages: [{ role: 'user', content: lines.join('\n') }],
                system: VISION_SYSTEM_PROMPT,
                onDelta: onDelta,
                signal: signal
            });
        }
    };

    // ========================================================
    // Dışa Aktarım — openview.js bu çekirdeği kullanır
    // ========================================================
    window.NesilOpenViewCore = {
        PC_ONLY_MESSAGE: PC_ONLY_MESSAGE,
        isDesktopPlatform: isDesktopPlatform,
        isElectron: isElectron,
        bridge: bridge,
        settings: settings,
        saveSettings: saveSettings,
        QUALITY_MAX_DIM: QUALITY_MAX_DIM,
        ScreenCapture: ScreenCapture,
        ScreenSelector: ScreenSelector,
        VisionAnalyzer: VisionAnalyzer,
        setScreenCallbacks: function (onConnected, onDisconnected) {
            screenConnected = onConnected;
            screenDisconnected = onDisconnected;
        }
    };

})();
