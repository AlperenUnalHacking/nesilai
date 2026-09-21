/* ========================================================
   NesilAI — OpenView Arayüz Katmanı
   --------------------------------------------------------
   Sol altta yaşayan yarı saydam panel:
     ┌─────────────────────────────────┐
     │        AI YANIT ALANI           │  ← içeriğe göre büyür/küçülür
     ├─────────────────────────────────┤
     │  [ Mesaj yaz…            ]      │
     │                    🎤   ➤  ⏹   │  ← Enter gönder, Shift+Enter satır
     ├─────────────────────────────────┤
     │  [ 👁 Ekrandakini Sor ]         │  ← Tüm Ekran / Bölge Seç
     │  [ ⚙ OpenView Ayarları ]       │
     └─────────────────────────────────┘

   Çekirdek yetenekler (ScreenCapture, ScreenSelector, VisionAnalyzer)
   js/openview-capture.js'tedir. Sohbet, mikrofon, TTS ve ayarlar bu
   dosyada; platformun mevcut NesilSTT / NesilTTS / kota sistemi kullanılır.
   ======================================================== */
(function () {
    'use strict';

    const Core = window.NesilOpenViewCore;
    if (!Core) return console.warn('OpenView: openview-capture.js yüklenemedi.');

    const settings = Core.settings;
    const SC = Core.ScreenCapture;

    // Electron'da bu sayfa ?ovwindow=1 ile açıldıysa BU pencere bağımsız
    // OpenView uygulamasıdır: panel tam ekran doldurur, PiP/sürükleme devre dışı.
    // ?overlay=1 ile açıldıysa pencere şeffaf + tık geçiren overlay modundadır.
    const OV_WINDOW_MODE = /[?&]ovwindow=1/.test(location.search);
    const OV_OVERLAY_MODE = OV_WINDOW_MODE && /[?&]overlay=1/.test(location.search);

    // ========================================================
    // Durum
    // ========================================================
    let rootEl = null;
    let ansStream = null, ansContent = null;
    let inputEl = null, sendBtn = null, stopBtn = null, micBtn = null;
    let askWrap = null, askInput = null, askMicBtn = null;
    let statusScreen = null, statusMic = null, micLevelBar = null;
    let settingsPop = null;

    let isOpen = false;
    let isStreaming = false;
    let aborterRef = null;
    let micActive = false;
    let currentAnswer = '';
    let answerWaiting = false;
    let lastHistory = [];   // OpenView oturumuna ait hafif geçmiş [{role,text}]
    let grabBusy = false;
    // Electron ana penceresi: bağımsız OpenView penceresini AÇTIK ve hâlâ kap
    // değilse true. IPC invoke Promise döndürdüğü için doğrudan sorgulama
    // her zaman 'açık' dönerdi (toggle bozukluğunun kök nedeni) → yerel bayrak.
    let ovWindowRequested = false;

    const QUALITY_LABELS = {
        fast: 'Hızlı — düşük çözünürlük, en az token',
        balanced: 'Dengeli (önerilen)',
        detailed: 'Detaylı — küçük yazılar için',
        native: 'Orijinal çözünürlük'
    };
    const SHORTCUTS = ['off', 'Alt+O', 'Ctrl+Alt+O', 'Ctrl+Shift+O'];

    // ========================================================
    // DOM kurulumu — bir kez, gizli olarak oluşturulur
    // ========================================================
    function buildDom() {
        if (rootEl) return;

        rootEl = document.createElement('section');
        rootEl.id = 'openview-panel';
        rootEl.className = 'openview hidden';
        rootEl.setAttribute('aria-label', 'OpenView ekran asistanı');
        rootEl.innerHTML =
            '<header class="ov-head">' +
                '<svg class="icon ov-title-icon" aria-hidden="true"><use href="#i-eye"/></svg>' +
                '<span class="ov-title">OpenView</span>' +
                '<span class="ov-status">' +
                    '<span class="ov-dot" id="ov-dot-screen" title="Ekran durumu"><i></i>Ekran</span>' +
                    '<span class="ov-dot" id="ov-dot-mic" title="Mikrofon durumu"><i></i>Mik</span>' +
                '</span>' +
                '<button type="button" class="ov-close ov-pip-btn" id="ov-pip-btn" title="PiP modu — ekranda daima üstte küçük pencere" aria-label="PiP modu" hidden>' +
                    '<svg class="icon" aria-hidden="true"><use href="#i-pip"/></svg>' +
                '</button>' +
                '<button type="button" class="ov-close" id="ov-close-btn" title="OpenView\'ı kapat" aria-label="OpenView\'ı kapat">' +
                    '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>' +
                '</button>' +
            '</header>' +

            '<div class="ov-answer" id="ov-answer">' +
                '<div class="ov-answer-scroll" id="ov-answer-scroll">' +
                    '<div class="ov-answer-content" id="ov-answer-content"></div>' +
                '</div>' +
            '</div>' +

            '<div class="ov-composer">' +
                '<textarea id="ov-input" class="ov-input" rows="1" placeholder="Ekrandan sor… (Enter = gönder)" aria-label="OpenView mesajı"></textarea>' +
                '<div class="ov-composer-actions">' +
                    '<button type="button" class="ov-icon-btn" id="ov-mic-btn" title="Sesle yaz" aria-label="Sesle yaz">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-mic"/></svg>' +
                    '</button>' +
                    '<button type="button" class="ov-icon-btn ov-stop hidden" id="ov-stop-btn" title="Yanıtı durdur" aria-label="Yanıtı durdur">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-stop"/></svg>' +
                    '</button>' +
                    '<button type="button" class="ov-icon-btn ov-send" id="ov-send-btn" title="Gönder" aria-label="Gönder">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-send"/></svg>' +
                    '</button>' +
                '</div>' +
            '</div>' +

            '<div class="ov-actions">' +
                '<div class="ov-ask-wrap" id="ov-ask-wrap">' +
                    '<button type="button" class="ov-btn ov-btn-accent" id="ov-ask-btn">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg>' +
                        '<span>Ekrandakini Sor</span>' +
                    '</button>' +
                    '<div class="ov-ask-menu hidden" id="ov-ask-menu">' +
                        '<p class="ov-ask-title">Ekrandakini Sor</p>' +
                        '<button type="button" class="ov-btn ov-btn-block" id="ov-ask-full">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-monitor"/></svg><span>Tüm Ekranı Analiz Et</span>' +
                        '</button>' +
                        '<button type="button" class="ov-btn ov-btn-block" id="ov-ask-region">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-crop"/></svg><span>Bölge Seç</span>' +
                        '</button>' +
                        '<div class="ov-ask-q">' +
                            '<input type="text" id="ov-ask-input" class="ov-input ov-ask-input" placeholder="Sorunuzu yazın (boşsa: “Ekranda ne var?”)">' +
                            '<button type="button" class="ov-icon-btn" id="ov-ask-mic" title="Sesle yaz" aria-label="Sesle yaz">' +
                                '<svg class="icon" aria-hidden="true"><use href="#i-mic"/></svg>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="ov-row">' +
                    '<button type="button" class="ov-btn" id="ov-settings-btn">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg>' +
                        '<span>OpenView Ayarları</span>' +
                    '</button>' +
                    '<div class="ov-level" title="Mikrofon seviyesi"><span id="ov-mic-level"></span></div>' +
                '</div>' +
            '</div>' +

            '<div class="ov-settings hidden" id="ov-settings"></div>';

        document.body.appendChild(rootEl);

        ansStream = rootEl.querySelector('#ov-answer-scroll');
        ansContent = rootEl.querySelector('#ov-answer-content');
        inputEl = rootEl.querySelector('#ov-input');
        sendBtn = rootEl.querySelector('#ov-send-btn');
        stopBtn = rootEl.querySelector('#ov-stop-btn');
        micBtn = rootEl.querySelector('#ov-mic-btn');
        askWrap = rootEl.querySelector('#ov-ask-wrap');
        askInput = rootEl.querySelector('#ov-ask-input');
        askMicBtn = rootEl.querySelector('#ov-ask-mic');
        statusScreen = rootEl.querySelector('#ov-dot-screen');
        statusMic = rootEl.querySelector('#ov-dot-mic');
        micLevelBar = rootEl.querySelector('#ov-mic-level');
        settingsPop = rootEl.querySelector('#ov-settings');

        bindEvents();
        Core.setScreenCallbacks(onScreenConnected, onScreenDisconnected);
        renderAnswer();
        updateStatusDots();
        Core.settings && applySettings(); // boyut/köşe/saydamlık

        // PiP desteği varsa düğmeyi göster (yalnızca tarayıcıda; Electron'da
        // bağımsız OpenView penceresi kullanılır)
        if (!OV_WINDOW_MODE && !Core.isElectron && pipAvailable()) {
            rootEl.querySelector('#ov-pip-btn').hidden = false;
        }
        if (OV_WINDOW_MODE) {
            document.title = 'OpenView';
            document.documentElement.classList.add('ov-window-mode');
        }
        if (OV_OVERLAY_MODE) {
            // Şeffaf overlay: boş alanlardan masaüstüne tık düşsün (click-through)
            rootEl.classList.add('ov-overlay');
            document.documentElement.classList.add('ov-overlay-host');
            // Panel dışındaki TÜM uygulama kabuğunu gizle — şeffaf zeminden
            // sohbet arayüzü sızmasın (CSS seçiciler taşıma/konumdan etkilenir,
            // bu yol garantidir). SVG sprite ve panel korunur.
            Array.from(document.body.children).forEach(function (el) {
                if (el === rootEl) return;
                const tag = el.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') return;
                if (el.classList && el.classList.contains('icon-sprite')) return;
                el.style.setProperty('display', 'none', 'important');
            });
            bindOverlayClickThrough();
        }
    }

    // ========================================================
    // Yanıt alanı — içeriğe göre otomatik büyüyen streaming görünüm
    // ========================================================
    function renderAnswer() {
        if (!ansContent) return;

        if (answerWaiting) {
            ansContent.innerHTML =
                '<span class="ov-typing" aria-label="Yanıt hazırlanıyor"><i></i><i></i><i></i></span>' +
                '<span class="ov-wait-label">Ekran analiz ediliyor…</span>';
        } else if (currentAnswer) {
            let html = window.renderMarkdown
                ? window.renderMarkdown(currentAnswer)
                : escapeHtml(currentAnswer);
            if (isStreaming) html += '<span class="ov-caret" aria-hidden="true"></span>';
            ansContent.innerHTML = html;
            if (window.Prism) { try { window.Prism.highlightAllUnder(ansContent); } catch (e) { /* yoksay */ } }
        } else {
            const connected = SC.isActive();
            ansContent.innerHTML =
                '<p class="ov-empty">Ekranını canlı olarak izliyorum. Bir soru yaz ya da ' +
                '<b>Ekrandakini Sor</b> ile ekranın tamamını / seçtiğin bölgeyi analiz ettir.</p>' +
                (connected ? '' :
                    '<button type="button" class="ov-btn ov-btn-accent ov-connect-btn" id="ov-connect-btn">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-monitor"/></svg><span>Ekranı Bağla</span>' +
                    '</button>');
            const connectBtn = ansContent.querySelector('#ov-connect-btn');
            if (connectBtn) connectBtn.addEventListener('click', connectScreen);
        }

        rootEl.classList.toggle('has-answer', !!currentAnswer || answerWaiting);
        ansStream.scrollTop = ansStream.scrollHeight; // yeni yanıt doğal şekilde görünür
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ========================================================
    // Panel içi bilgi / toast
    // ========================================================
    let ovToastTimer = null;
    function ovToast(message, type) {
        if (!rootEl) return;
        let t = rootEl.querySelector('.ov-toast');
        if (!t) {
            t = document.createElement('div');
            t.className = 'ov-toast';
            rootEl.appendChild(t);
        }
        t.textContent = message;
        t.className = 'ov-toast show' + (type === 'error' ? ' error' : '');
        clearTimeout(ovToastTimer);
        ovToastTimer = setTimeout(() => t.classList.remove('show'), 2600);
    }

    // ========================================================
    // Kota — platformun mevcut kota sistemi
    // ========================================================
    function quotaGuard(type) {
        if (typeof window.checkQuota === 'function') return window.checkQuota(type);
        return true;
    }
    function quotaIncrement(type) {
        if (typeof window.incrementQuota === 'function') window.incrementQuota(type);
    }

    // ========================================================
    // Ekran bağlantısı
    // ========================================================
    function onScreenConnected() {
        updateStatusDots();
        if (isOpen && !currentAnswer && !answerWaiting) renderAnswer();
    }

    function onScreenDisconnected() {
        updateStatusDots();
        ovToast('Ekran paylaşımı durduruldu');
        if (isOpen) renderAnswer();
    }

    async function connectScreen() {
        try {
            await SC.ensure();
            ovToast('Ekran bağlantısı kuruldu', 'success');
        } catch (e) {
            // Kullanıcı seçim penceresini kapattıysa sessizce bilgi ver
            ovToast('Ekran seçilmedi — tekrar denemek için "Ekranı Bağla"', 'error');
        }
        renderAnswer();
    }

    // ========================================================
    // Ana akış: soru + kare → VisionAnalyzer → streaming yanıt
    // ========================================================
    async function runAnalysis(question, frame) {
        if (isStreaming) return;

        isStreaming = true;
        currentAnswer = '';
        answerWaiting = true;
        updateSendButtons();
        renderAnswer();

        aborterRef = new AbortController();
        const signal = aborterRef.signal;

        try {
            const result = await Core.VisionAnalyzer.analyze({
                imageDataUrl: frame.dataUrl,
                question: question,
                signal: signal,
                onDelta: function (_chunk, full) {
                    if (signal.aborted) return;
                    answerWaiting = false;
                    currentAnswer = full || '';
                    renderAnswer();
                }
            });

            const text = (typeof result === 'string' ? result : (result && result.text)) || '';
            answerWaiting = false;
            currentAnswer = text || currentAnswer || '(boş yanıt)';
            lastHistory.push({ role: 'user', text: question });
            lastHistory.push({ role: 'assistant', text: currentAnswer });
            if (lastHistory.length > 16) lastHistory = lastHistory.slice(-16);
        } catch (err) {
            answerWaiting = false;
            const aborted = err && (err.name === 'AbortError' || /abort/i.test(String(err && err.message)));
            if (aborted) {
                if (currentAnswer) {
                    currentAnswer += '\n\n*(yanıt durduruldu)*';
                    lastHistory.push({ role: 'user', text: question });
                    lastHistory.push({ role: 'assistant', text: currentAnswer });
                } else {
                    currentAnswer = '*(yanıt başlamadan durduruldu)*';
                }
                ovToast('Yanıt durduruldu');
            } else {
                const msg = (err && err.message) || 'Bilinmeyen hata';
                if (currentAnswer) {
                    currentAnswer += '\n\n**Hata:** ' + msg;
                } else {
                    currentAnswer = '**Yanıt alınamadı**\n\n> ' + msg +
                        '\n\nVision destekli bir sağlayıcı (Gemini, Groq vision, OpenAI vb.) seçmek ' +
                        'ekranı gerçekten "görmesini" sağlar; şu an OCR yedeği kullanılıyor olabilir.';
                }
                ovToast('Yapay zekadan yanıt alınamadı', 'error');
            }
        } finally {
            isStreaming = false;
            aborterRef = null;
            answerWaiting = false;
            updateSendButtons();
            renderAnswer();
            speakIfNeeded(currentAnswer);
        }
    }

    function speakIfNeeded(text) {
        if (!settings.voiceReply || !text) return;
        if (!window.NesilTTS || !window.NesilTTS.isSupported()) return;
        if (!quotaGuard('tts')) return;
        quotaIncrement('tts');
        window.NesilTTS.speak(text);
    }

    /** Paneli yakalama sırasında gizle → kendi ekranını çekmesin */
    async function withPanelHidden(job) {
        if (!settings.hidePanelOnCapture || !rootEl) return job();
        const wasOpen = isOpen;
        rootEl.classList.add('capturing');
        try {
            return await job();
        } finally {
            rootEl.classList.remove('capturing');
            if (wasOpen) rootEl.classList.remove('hidden');
        }
    }

    async function grabSafe() {
        if (grabBusy) return null;
        grabBusy = true;
        try {
            return await withPanelHidden(() => SC.grabFrame());
        } catch (e) {
            ovToast((e && e.message) || 'Ekran görüntüsü alınamadı', 'error');
            if (!SC.isActive()) renderAnswer();
            return null;
        } finally {
            grabBusy = false;
        }
    }

    // ========================================================
    // Gönderim — panel mesaj kutusu
    // ========================================================
    async function sendCurrent() {
        const question = (inputEl.value || '').trim();
        if (!question || isStreaming) return;

        if (!SC.isActive()) {
            await connectScreen();
            if (!SC.isActive()) return; // kullanıcı iptal etti
        }
        if (!quotaGuard('chats')) return;

        inputEl.value = '';
        autoGrow(inputEl);
        quotaIncrement('chats');

        const frame = await grabSafe();
        if (!frame) return;

        closeAskMenu();
        await runAnalysis(question, frame);
    }

    function stopActive() {
        if (aborterRef) {
            try { aborterRef.abort(); } catch (e) { /* yoksay */ }
        }
        if (window.NesilTTS) window.NesilTTS.stop(); // sesli yanıt da kessin
    }

    function updateSendButtons() {
        if (!sendBtn || !stopBtn) return;
        stopBtn.classList.toggle('hidden', !isStreaming);
        sendBtn.classList.toggle('hidden', isStreaming);
        sendBtn.disabled = isStreaming;
    }

    // ========================================================
    // "Ekrandakini Sor" akışı
    // ========================================================
    function toggleAskMenu() {
        if (!askWrap) return;
        const menu = askWrap.querySelector('#ov-ask-menu');
        const willOpen = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !willOpen);
        askWrap.classList.toggle('open', willOpen);
        if (willOpen) setTimeout(() => askInput && askInput.focus(), 60);
    }
    function closeAskMenu() {
        if (!askWrap) return;
        const menu = askWrap.querySelector('#ov-ask-menu');
        if (menu) menu.classList.add('hidden');
        askWrap.classList.remove('open');
    }

    async function askScreen(useRegion) {
        if (isStreaming) return;

        if (!SC.isActive()) {
            await connectScreen();
            if (!SC.isActive()) { closeAskMenu(); return; }
        }
        if (!quotaGuard('chats')) return;

        const question = (askInput.value || '').trim() || 'Ekranda ne var? Görünen içeriği özetle.';
        askInput.value = '';

        quotaIncrement('chats');
        closeAskMenu();

        const frame = await grabSafe();
        if (!frame) return;

        if (useRegion) {
            // PiP'teyken seçim ekranı da PiP penceresinde açılır
            const region = await Core.ScreenSelector.open(frame, activeHostDoc());
            if (!region) return; // kullanıcı iptal etti
            await runAnalysis(question, { dataUrl: region.dataUrl, width: 0, height: 0 });
        } else {
            await runAnalysis(question, frame);
        }
    }

    // ========================================================
    // Mikrofon — mevcut NesilSTT (Web Speech API)
    // ========================================================
    function toggleMic(target) {
        const isAsk = target === 'ask';
        const btn = isAsk ? askMicBtn : micBtn;

        if (micActive) {
            if (window.NesilSTT) window.NesilSTT.stop();
            micActive = false;
            stopPulse();
            updateStatusDots();
            if (btn) btn.classList.remove('listening');
            return;
        }

        if (!settings.micEnabled) {
            ovToast('Mikrofon OpenView ayarlarından kapalı', 'error');
            return;
        }
        if (!window.NesilSTT || !window.NesilSTT.isSupported()) {
            ovToast('Konuşma tanıma bu cihazda desteklenmiyor', 'error');
            return;
        }
        if (!quotaGuard('stt')) return;

        const input = isAsk ? askInput : inputEl;
        window.NesilSTT.start({
            language: 'tr-TR',
            continuous: false,
            onStart: function () {
                micActive = true;
                quotaIncrement('stt');
                startPulse();
                updateStatusDots();
                if (btn) btn.classList.add('listening');
                ovToast('Dinliyorum… konuşabilirsin');
            },
            onFinal: function (text) {
                if (input && text) {
                    input.value = (input.value ? input.value + ' ' : '') + text;
                    if (input === inputEl) autoGrow(inputEl);
                }
            },
            onEnd: function () {
                micActive = false;
                stopPulse();
                updateStatusDots();
                if (btn) btn.classList.remove('listening');
            },
            onError: function (e) {
                const code = e && e.error;
                if (code === 'not-allowed' || code === 'service-not-allowed') {
                    ovToast('Mikrofon izni reddedildi', 'error');
                } else if (code && code !== 'no-speech' && code !== 'aborted') {
                    ovToast('Mikrofon hatası: ' + code, 'error');
                }
            }
        });
    }

    function startPulse() {
        stopPulse();
        micLevelBar._pulse = setInterval(function () {
            // Web Speech API mikrofonu işgal ettiğinden gerçek seviye okunamaz;
            // nabız animasyonu görsel geri bildirim sağlar.
            micLevelBar.style.width = (30 + Math.abs(Math.sin(Date.now() / 220)) * 55) + '%';
        }, 110);
    }
    function stopPulse() {
        if (micLevelBar && micLevelBar._pulse) {
            clearInterval(micLevelBar._pulse);
            micLevelBar._pulse = null;
        }
        if (micLevelBar) micLevelBar.style.width = '0%';
    }

    // ========================================================
    // Ayarlar paneli
    // ========================================================
    function openSettings() {
        renderSettings();
        settingsPop.classList.remove('hidden');
    }
    function closeSettings() {
        if (settingsPop) settingsPop.classList.add('hidden');
    }
    function toggleSettings() {
        if (settingsPop.classList.contains('hidden')) openSettings();
        else closeSettings();
    }

    function monitorOptionsHtml(selectedId) {
        const bridge = Core.bridge;
        if (!bridge || !bridge.getDisplays) {
            return '<option value="">Sistem varsayılanı</option>';
        }
        let displays = [];
        try { displays = bridge.getDisplays() || []; } catch (e) { /* yoksay */ }
        if (!displays.length) return '<option value="">Sistem varsayılanı</option>';
        return displays.map(function (d, i) {
            const label = (d.label || ('Monitör ' + (i + 1))) + (i === 0 ? ' — Ana Ekran' : '');
            const val = String(d.id != null ? d.id : i);
            return '<option value="' + escapeHtml(val) + '"' +
                (String(selectedId) === val ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
        }).join('');
    }

    function renderSettings() {
        const s = settings;
        settingsPop.innerHTML =
            '<div class="ov-settings-head">' +
                '<span>OpenView Ayarları</span>' +
                '<button type="button" class="ov-icon-btn" id="ov-set-close" title="Kapat">' +
                    '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>' +
                '</button>' +
            '</div>' +
            '<div class="ov-settings-body">' +

            '<p class="ov-set-title"><svg class="icon" aria-hidden="true"><use href="#i-mic"/></svg> Mikrofon</p>' +
            '<label class="ov-switch"><input type="checkbox" id="ov-set-mic"' + (s.micEnabled ? ' checked' : '') + '>' +
                '<span></span>Mikrofonu etkinleştir (sesle yazma)</label>' +
            '<p class="ov-note">Sesle yazma, platformun mevcut konuşma tanıma motorunu (Web Speech) kullanır; ' +
                'cihazın varsayılan mikrofonu seçilir.</p>' +

            '<p class="ov-set-title"><svg class="icon" aria-hidden="true"><use href="#i-volume"/></svg> Sesli Yanıt</p>' +
            '<label class="ov-switch"><input type="checkbox" id="ov-set-tts"' + (s.voiceReply ? ' checked' : '') + '>' +
                '<span></span>AI yanıtlarını sesli oku (TTS)</label>' +
            '<div class="ov-field"><label>Ses seviyesi — <b id="ov-set-vol-val">' + (s.ttsVolume != null ? s.ttsVolume : 1).toFixed(1) + '</b></label>' +
                '<input type="range" id="ov-set-vol" class="ov-range" min="0.1" max="1" step="0.1" value="' + (s.ttsVolume != null ? s.ttsVolume : 1) + '"></div>' +
            '<p class="ov-note">Ses ve hız seçimi ana Ayarlar → Ses bölümünden alınır.</p>' +

            '<p class="ov-set-title"><svg class="icon" aria-hidden="true"><use href="#i-monitor"/></svg> Ekran</p>' +
            '<div class="ov-field"><label>Paylaşılacak ekran</label>' +
                '<select id="ov-set-monitor" class="ov-select">' + monitorOptionsHtml(s.monitorId) + '</select>' +
                '<p class="ov-note">Tarayıcıda her bağlantıda seçim penceresi açılır; bilgisayar uygulamasında buradaki tercih otomatik uygulanır.</p></div>' +

            '<p class="ov-set-title"><svg class="icon" aria-hidden="true"><use href="#i-cpu"/></svg> Görüntü Analizi</p>' +
            '<div class="ov-field"><label>Analiz kalitesi</label>' +
                '<select id="ov-set-quality" class="ov-select">' +
                    Object.keys(QUALITY_LABELS).map(function (k) {
                        return '<option value="' + k + '"' + (s.screenQuality === k ? ' selected' : '') + '>' + QUALITY_LABELS[k] + '</option>';
                    }).join('') +
                '</select></div>' +
            '<div class="ov-field"><label>Görüntü sıkıştırma — <b id="ov-set-jq-val">' + Math.round(s.jpegQuality * 100) + '%</b></label>' +
                '<input type="range" id="ov-set-jq" class="ov-range" min="0.4" max="0.95" step="0.05" value="' + s.jpegQuality + '"></div>' +
            '<label class="ov-switch"><input type="checkbox" id="ov-set-hide"' + (s.hidePanelOnCapture ? ' checked' : '') + '>' +
                '<span></span>Analiz sırasında paneli gizle (kendi ekranını çekmesin)</label>' +

            '<p class="ov-set-title"><svg class="icon" aria-hidden="true"><use href="#i-palette"/></svg> Arayüz</p>' +
            '<div class="ov-field"><label>Saydamlık — <b id="ov-set-op-val">' + Math.round(s.panelOpacity * 100) + '%</b></label>' +
                '<input type="range" id="ov-set-op" class="ov-range" min="0.55" max="0.98" step="0.01" value="' + s.panelOpacity + '"></div>' +
            '<div class="ov-field-row">' +
                '<div class="ov-field"><label>Boyut</label>' +
                    '<select id="ov-set-size" class="ov-select">' +
                        '<option value="compact"' + (s.panelSize === 'compact' ? ' selected' : '') + '>Kompakt</option>' +
                        '<option value="normal"' + (s.panelSize === 'normal' ? ' selected' : '') + '>Normal</option>' +
                        '<option value="wide"' + (s.panelSize === 'wide' ? ' selected' : '') + '>Geniş</option>' +
                    '</select></div>' +
                '<div class="ov-field"><label>Konum</label>' +
                    '<select id="ov-set-corner" class="ov-select">' +
                        '<option value="left"' + (s.panelCorner === 'left' ? ' selected' : '') + '>Sol alt</option>' +
                        '<option value="right"' + (s.panelCorner === 'right' ? ' selected' : '') + '>Sağ alt</option>' +
                    '</select></div>' +
            '</div>' +

            '<p class="ov-set-title"><svg class="icon" aria-hidden="true"><use href="#i-monitor"/></svg> Pencere</p>' +
            '<label class="ov-switch"><input type="checkbox" id="ov-set-overlay"' + (s.overlayMode ? ' checked' : '') +
                (Core.isElectron && Core.bridge && Core.bridge.setOverlayMode ? '' : ' disabled') + '>' +
                '<span></span>Şeffaf overlay modu</label>' +
            '<p class="ov-note">OpenView penceresi çerçevesiz ve şeffaf açılır; panel boş alanlarından tıkları masaüstüne geçirir. ' +
                'Mod değişince pencere yeniden açılır.</p>' +

            '<p class="ov-set-title"><svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg> Genel</p>' +
            '<label class="ov-switch"><input type="checkbox" id="ov-set-autostart"' + (s.autoStart ? ' checked' : '') + '>' +
                '<span></span>Uygulama açılışında OpenView\'ı otomatik başlat</label>' +
            '<div class="ov-field"><label>Kısayol tuşu</label>' +
                '<select id="ov-set-shortcut" class="ov-select">' +
                    SHORTCUTS.map(function (k) {
                        return '<option value="' + k + '"' + (s.shortcut === k ? ' selected' : '') + '>' +
                            (k === 'off' ? 'Kapalı' : k) + '</option>';
                    }).join('') +
                '</select></div>' +
            '<button type="button" class="ov-btn ov-btn-danger ov-btn-block" id="ov-set-close-ov">' +
                '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg><span>OpenView\'ı Kapat</span>' +
            '</button>' +

            '<p class="ov-privacy"><svg class="icon" aria-hidden="true"><use href="#i-info"/></svg>' +
                'Gizlilik: Ekran görüntüleri yalnızca sen sorduğun anda alınır, yanıttan sonra atılır; ' +
                'hiçbir görüntü kalıcı olarak saklanmaz.</p>' +
            '</div>';

        // --- olay bağlama ---
        settingsPop.querySelector('#ov-set-close').addEventListener('click', closeSettings);
        settingsPop.querySelector('#ov-set-close-ov').addEventListener('click', function () {
            Core.saveSettings();
            closeView();
        });

        bindSwitch('ov-set-mic', 'micEnabled');
        bindSwitch('ov-set-tts', 'voiceReply');
        bindSwitch('ov-set-hide', 'hidePanelOnCapture');
        bindSwitch('ov-set-autostart', 'autoStart');

        // Şeffaf overlay modu — yalnızca Electron'da etkin
        (function () {
            const el = settingsPop.querySelector('#ov-set-overlay');
            if (!el || el.disabled) return;
            el.addEventListener('change', function () {
                settings.overlayMode = el.checked;
                Core.saveSettings();
                try { Core.bridge.setOverlayMode(el.checked); } catch (e) { /* yoksay */ }
                ovToast(el.checked ? 'Overlay modu açılıyor — pencere şeffaf yeniden yaratılıyor' : 'Overlay modu kapatıldı — normal pencere');
            });
        })();

        bindRange('ov-set-vol', function (v) {
            settings.ttsVolume = v;
            if (window.NesilTTS && window.NesilTTS.setVolume) window.NesilTTS.setVolume(v);
            var el = settingsPop.querySelector('#ov-set-vol-val');
            if (el) el.textContent = v.toFixed(1);
        });
        bindRange('ov-set-jq', function (v) {
            settings.jpegQuality = v;
            var el = settingsPop.querySelector('#ov-set-jq-val');
            if (el) el.textContent = Math.round(v * 100) + '%';
        });
        bindRange('ov-set-op', function (v) {
            settings.panelOpacity = v;
            var el = settingsPop.querySelector('#ov-set-op-val');
            if (el) el.textContent = Math.round(v * 100) + '%';
            applySettings();
        });

        settingsPop.querySelector('#ov-set-quality').addEventListener('change', function (e) {
            settings.screenQuality = e.target.value;
            Core.saveSettings();
        });
        settingsPop.querySelector('#ov-set-monitor').addEventListener('change', function (e) {
            const v = e.target.value;
            settings.monitorId = v === '' ? null : v;
            Core.saveSettings();
            ovToast('Monitör tercihi kaydedildi — yeni bağlantıda uygulanır');
        });
        settingsPop.querySelector('#ov-set-size').addEventListener('change', function (e) {
            settings.panelSize = e.target.value;
            Core.saveSettings(); applySettings();
        });
        settingsPop.querySelector('#ov-set-corner').addEventListener('change', function (e) {
            settings.panelCorner = e.target.value;
            settings.panelPos = null; // köşe değişince serbest konum sıfırlanır
            Core.saveSettings(); applySettings();
        });
        settingsPop.querySelector('#ov-set-shortcut').addEventListener('change', function (e) {
            settings.shortcut = e.target.value;
            Core.saveSettings();
        });
    }

    function bindSwitch(id, key) {
        const el = settingsPop.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('change', function () {
            settings[key] = el.checked;
            Core.saveSettings();
            if (key === 'micEnabled' && !el.checked && micActive) toggleMic();
            if (key === 'voiceReply') {
                if (!el.checked && window.NesilTTS) window.NesilTTS.stop();
                if (el.checked && window.NesilTTS && window.NesilTTS.setVolume) {
                    window.NesilTTS.setVolume(settings.ttsVolume || 1);
                }
            }
        });
    }
    function bindRange(id, apply) {
        const el = settingsPop.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('input', function () {
            apply(parseFloat(el.value));
            Core.saveSettings();
        });
    }

    // ========================================================
    // Ayarları arayüze uygula (boyut / köşe / saydamlık)
    // ========================================================
    function applySettings() {
        if (!rootEl) return;
        rootEl.dataset.size = settings.panelSize;
        rootEl.dataset.corner = settings.panelCorner;
        rootEl.style.setProperty('--ov-alpha', String(settings.panelOpacity));

        // Serbest konum (sürüklenmişse) uygula; yoksa köşe varsayılanı geçerli
        if (settings.panelPos && !isPipActive()) {
            rootEl.style.left = settings.panelPos.left;
            rootEl.style.top = settings.panelPos.top;
            rootEl.style.right = 'auto';
            rootEl.style.bottom = 'auto';
        } else {
            rootEl.style.left = '';
            rootEl.style.top = '';
            rootEl.style.right = '';
            rootEl.style.bottom = '';
        }
    }

    // ========================================================
    // PiP (Picture-in-Picture) — OpenView'ı daima üstte mini pencereye taşı
    // --------------------------------------------------------
    // Document PiP API (Chromium 116+ / Electron 33+): panel aynı JS
    // bağlamında kalır; sohbet, ekran bağlantısı ve ayarlar olduğu gibi
    // devam ederken pencere işletim sistemi düzeyinde üstte yüzer.
    // ========================================================
    function pipAvailable() {
        return 'documentPictureInPicture' in window;
    }

    function pipWindow() {
        return pipAvailable() ? window.documentPictureInPicture.window : null;
    }

    function isPipActive() {
        return !!(pipWindow() && rootEl && rootEl.ownerDocument !== document);
    }

    let pipEnteredAt = 0; // sahte pagehide koruması için giriş zamanı

    // PiP belgesine gömülen minimum garanti CSS — style.css kopyalaması her
    // ortamda mümkün olmayabilir (file:// CORS, CSP); panel bu olmadan boş
    // arka plan olarak görünür. Ana stille %100 örtüşmesin diye yalnızca
    // OpenView'a özel kurallar burada tek kaynak olarak yeniden yazılır.
    const PIP_BASE_CSS = [
        // PiP belgesi ana belgenin font değişkenlerini bilmez → somut font zinciri uygula.
        // (font bozuk görünme sorununun kök nedeni buydu)
        'html { --ov-font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; }',
        'html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #10121e; overflow: hidden; font-family: var(--ov-font-sans); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }',
        '.openview {',
        '    --ov-alpha: 0.92;',
        '    position: fixed !important; inset: 0 !important; width: 100% !important; max-width: none !important; height: 100% !important;',
        '    display: flex; flex-direction: column; color: #e8eaf2; font-size: 13.5px; font-family: var(--ov-font-sans);',
        '    background: rgba(18, 21, 33, var(--ov-alpha));',
        '    border: none; border-radius: 0; box-shadow: none; overflow: visible; transform: none !important;',
        '}',
        '.openview .ov-head {',
        '    display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px;',
        '    border-bottom: 1px solid rgba(148, 168, 255, 0.12); user-select: none; flex: 0 0 auto;',
        '}',
        '.ov-title-icon { width: 16px; height: 16px; flex: 0 0 16px; color: rgba(232, 234, 242, 0.9); }',
        '.ov-title { font-weight: 700; font-size: 13.5px; letter-spacing: 0.4px; }',
        '.ov-status { display: flex; gap: 8px; margin-left: auto; }',
        '.ov-dot {',
        '    display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px;',
        '    color: rgba(232, 234, 242, 0.55); padding: 2px 7px; border-radius: 20px;',
        '    border: 1px solid rgba(255, 255, 255, 0.07); background: rgba(255, 255, 255, 0.03);',
        '}',
        '.ov-dot i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.25); }',
        '.ov-dot.on { color: #9fe8b8; }',
        '.ov-dot.on i { background: #4ade80; box-shadow: 0 0 8px rgba(74, 222, 128, 0.8); }',
        '.ov-close {',
        '    display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px;',
        '    border: none; border-radius: 8px; background: transparent; color: rgba(232, 234, 242, 0.6); cursor: pointer;',
        '}',
        '.ov-close:hover { background: rgba(255, 68, 88, 0.16); color: #ff7a88; }',
        '.ov-close.active { color: #e8eaf2; background: rgba(255, 255, 255, 0.14); }',
        '.ov-close[hidden] { display: none; }',
        '.ov-answer { padding: 4px 0; min-height: 0; flex: 1; display: flex; flex-direction: column; }',
        '.ov-answer-scroll {',
        '    flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 10px 14px;',
        '    scrollbar-width: thin; scrollbar-color: rgba(148, 168, 255, 0.35) transparent;',
        '}',
        '.ov-answer-scroll::-webkit-scrollbar { width: 6px; }',
        '.ov-answer-scroll::-webkit-scrollbar-thumb { background: rgba(148, 168, 255, 0.3); border-radius: 6px; }',
        '.ov-answer-content { font-size: 13.5px; line-height: 1.55; word-break: break-word; }',
        '.ov-answer-content p { margin: 0 0 8px; }',
        '.ov-answer-content p:last-child { margin-bottom: 0; }',
        '.ov-answer-content code { background: rgba(124, 156, 255, 0.12); border-radius: 5px; padding: 1px 5px; font-size: 12.5px; }',
        '.ov-answer-content pre { background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(148, 168, 255, 0.12); border-radius: 10px; padding: 10px; overflow-x: auto; font-size: 12px; margin: 8px 0; }',
        '.ov-answer-content ul, .ov-answer-content ol { margin: 6px 0; padding-left: 20px; }',
        '.ov-answer-content blockquote { margin: 6px 0; padding: 4px 10px; border-left: 3px solid rgba(148, 168, 255, 0.5); color: rgba(232, 234, 242, 0.75); }',
        '.ov-empty { color: rgba(232, 234, 242, 0.55); margin: 2px 0 8px; }',
        '.ov-connect-btn { margin-top: 2px; }',
        '.ov-typing { display: inline-flex; gap: 4px; margin-right: 8px; vertical-align: middle; }',
        '.ov-typing i { width: 6px; height: 6px; border-radius: 50%; background: #aab6d8; animation: ov-bounce 1.1s infinite ease-in-out; }',
        '.ov-typing i:nth-child(2) { animation-delay: 0.15s; }',
        '.ov-typing i:nth-child(3) { animation-delay: 0.3s; }',
        '@keyframes ov-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-4px); opacity: 1; } }',
        '.ov-wait-label { color: rgba(232, 234, 242, 0.6); font-size: 12.5px; }',
        '.ov-caret { display: inline-block; width: 7px; height: 14px; margin-left: 3px; vertical-align: -2px; background: #aab6d8; border-radius: 2px; animation: ov-blink 0.9s steps(1) infinite; }',
        '@keyframes ov-blink { 50% { opacity: 0; } }',
        '.ov-composer { display: flex; align-items: flex-end; gap: 6px; padding: 8px 10px; border-top: 1px solid rgba(148, 168, 255, 0.1); flex: 0 0 auto; }',
        '.ov-input {',
        '    flex: 1; min-width: 0; resize: none; border: 1px solid rgba(148, 168, 255, 0.16); border-radius: 12px;',
        '    background: rgba(0, 0, 0, 0.3); color: #e8eaf2; font: inherit; font-size: 13px; line-height: 1.4;',
        '    padding: 8px 11px; outline: none; max-height: 110px;',
        '}',
        '.ov-input::placeholder { color: rgba(232, 234, 242, 0.38); }',
        '.ov-input:focus { border-color: rgba(148, 168, 255, 0.55); box-shadow: 0 0 0 3px rgba(148, 168, 255, 0.12); }',
        '.ov-composer-actions { display: flex; gap: 4px; }',
        '.ov-icon-btn {',
        '    display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; flex: 0 0 32px;',
        '    border: 1px solid rgba(148, 168, 255, 0.14); border-radius: 10px; background: rgba(255, 255, 255, 0.04);',
        '    color: rgba(232, 234, 242, 0.75); cursor: pointer;',
        '}',
        '.ov-icon-btn:hover { background: rgba(255, 255, 255, 0.1); color: #e8eaf2; }',
        '.ov-icon-btn .icon { width: 16px; height: 16px; }',
        '.ov-icon-btn.listening { color: #ffb4be; border-color: rgba(255, 100, 120, 0.5); background: rgba(255, 80, 100, 0.12); }',
        '.ov-icon-btn.ov-stop { color: #ffb4be; border-color: rgba(255, 100, 120, 0.45); background: rgba(255, 80, 100, 0.1); }',
        '.ov-icon-btn.ov-send { color: #0b1020; background: rgba(232, 234, 242, 0.9); border-color: transparent; }',
        '.ov-icon-btn.ov-send:hover { background: rgba(255, 255, 255, 1); }',
        '.ov-icon-btn.hidden { display: none; }',
        '.ov-actions { display: flex; flex-direction: column; gap: 6px; padding: 4px 10px 10px; flex: 0 0 auto; }',
        '.ov-row { display: flex; align-items: center; gap: 8px; }',
        '.ov-row .ov-btn { flex: 1; }',
        '.ov-level { width: 54px; height: 8px; flex: 0 0 54px; border-radius: 6px; background: rgba(255, 255, 255, 0.07); overflow: hidden; }',
        '.ov-level span { display: block; height: 100%; width: 0%; border-radius: 6px; background: rgba(232, 234, 242, 0.65); }',
        '.ov-btn {',
        '    display: inline-flex; align-items: center; justify-content: center; gap: 7px;',
        '    border: 1px solid rgba(148, 168, 255, 0.18); border-radius: 11px; background: rgba(255, 255, 255, 0.045);',
        '    color: #e8eaf2; font: inherit; font-size: 12.8px; font-weight: 600; padding: 8px 12px; cursor: pointer;',
        '}',
        '.ov-btn:hover { background: rgba(255, 255, 255, 0.1); border-color: rgba(148, 168, 255, 0.4); }',
        '.ov-btn .icon { width: 15px; height: 15px; }',
        '.ov-btn-accent { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.24); color: #e8eaf2; }',
        '.ov-btn-accent:hover { background: rgba(255, 255, 255, 0.14); border-color: rgba(255, 255, 255, 0.34); }',
        '.ov-btn-block { width: 100%; }',
        '.ov-btn-danger { border-color: rgba(255, 90, 110, 0.4); color: #ff9aa6; background: rgba(255, 80, 100, 0.08); }',
        '.ov-ask-wrap { position: relative; }',
        '.ov-ask-menu {',
        '    position: absolute; bottom: calc(100% + 8px); left: 0; right: 0; display: flex; flex-direction: column; gap: 7px;',
        '    padding: 12px; border-radius: 14px; background: rgba(18, 21, 34, 0.96);',
        '    border: 1px solid rgba(148, 168, 255, 0.2); box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5); z-index: 5;',
        '}',
        '.ov-ask-menu.hidden { display: none; }',
        '.ov-ask-title { margin: 0 0 2px; font-size: 12px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: rgba(232, 234, 242, 0.6); }',
        '.ov-ask-q { display: flex; align-items: center; gap: 6px; margin-top: 2px; }',
        '.ov-ask-input { flex: 1; font-size: 12.5px; padding: 7px 10px; }',
        '.ov-settings {',
        '    position: absolute; bottom: calc(100% + 10px); left: 0; width: 330px; max-width: 100%;',
        '    max-height: min(560px, 78%); display: flex; flex-direction: column; border-radius: 16px;',
        '    background: rgba(16, 18, 30, 0.97); border: 1px solid rgba(148, 168, 255, 0.2);',
        '    box-shadow: 0 22px 54px rgba(0, 0, 0, 0.55); z-index: 6; overflow: hidden;',
        '}',
        '.ov-settings.hidden { display: none; }',
        // PiP modunda panel pencereyi doldurur → popup panelin üstüne açılamaz,
        // pencere dışına taşar (görünmez). Panel içinde sayfa gibi açılır.
        '.openview.pip .ov-settings { top: 50px; bottom: 10px; left: 10px; right: 10px; width: auto; max-width: none; max-height: none; z-index: 20; }',
        '.openview.pip .ov-settings-body { flex: 1; min-height: 0; }',
        '.ov-settings-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; font-weight: 700; font-size: 13px; border-bottom: 1px solid rgba(148, 168, 255, 0.12); flex: 0 0 auto; }',
        '.ov-settings-body { overflow-y: auto; padding: 4px 14px 14px; }',
        '.ov-set-title { display: flex; align-items: center; gap: 7px; margin: 14px 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.4px; color: rgba(232, 234, 242, 0.75); }',
        '.ov-set-title .icon { width: 14px; height: 14px; }',
        '.ov-set-title:first-child { margin-top: 10px; }',
        '.ov-field { margin: 8px 0; }',
        '.ov-field label { display: block; font-size: 12px; color: rgba(232, 234, 242, 0.7); margin-bottom: 5px; }',
        '.ov-field-row { display: flex; gap: 10px; }',
        '.ov-field-row .ov-field { flex: 1; }',
        '.ov-select, .ov-range { width: 100%; }',
        '.ov-select { background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(148, 168, 255, 0.16); border-radius: 9px; color: #e8eaf2; font: inherit; font-size: 12.5px; padding: 7px 9px; outline: none; }',
        '.ov-select option { background: #14172a; color: #e8eaf2; }',
        '.ov-switch { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: rgba(232, 234, 242, 0.85); margin: 7px 0; cursor: pointer; }',
        '.ov-switch input { display: none; }',
        '.ov-switch span { width: 34px; height: 19px; flex: 0 0 34px; border-radius: 20px; background: rgba(255, 255, 255, 0.12); position: relative; }',
        '.ov-switch span::after { content: \'\'; position: absolute; top: 2.5px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #aab3c8; }',
        '.ov-switch input:checked + span { background: rgba(148, 168, 255, 0.55); }',
        '.ov-switch input:checked + span::after { transform: translateX(14px); background: #ffffff; }',
        '.ov-note, .ov-privacy { font-size: 11px; line-height: 1.45; color: rgba(232, 234, 242, 0.42); margin: 4px 0 8px; }',
        '.ov-privacy { display: flex; gap: 6px; margin-top: 14px; padding-top: 10px; border-top: 1px solid rgba(148, 168, 255, 0.1); }',
        '.ov-privacy .icon { width: 13px; height: 13px; flex: 0 0 13px; margin-top: 1px; }',
        '.ov-toast {',
        '    position: absolute; top: 10px; left: 50%; transform: translate(-50%, -8px); padding: 7px 14px;',
        '    border-radius: 20px; background: rgba(20, 23, 38, 0.95); border: 1px solid rgba(148, 168, 255, 0.3);',
        '    color: #e8eaf2; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; z-index: 10;',
        '}',
        '.ov-toast.show { opacity: 1; transform: translate(-50%, 0); }',
        '.ov-toast.error { border-color: rgba(255, 90, 110, 0.5); color: #ffb4be; }',
        '.icon-sprite { display: none; }',
        '.icon { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }',
        '.icon-fill { fill: currentColor; stroke: none; }'
    ].join('\n');

    function copyStylesToPip(pip) {
        // 1) Garanti edilen taban CSS — her ortamda çalışır (file://, CSP, her şey)
        const base = pip.document.createElement('style');
        base.id = 'ov-pip-base-css';
        base.textContent = PIP_BASE_CSS;
        pip.document.head.appendChild(base);

        // 2) Uygulamanın kalan stilleri (değişkenler, tema, markdown…) —
        //    erişilebilirse kopyala; erişilemezse sessizce geç (taban yeterli)
        Array.from(document.styleSheets).forEach(function (styleSheet) {
            try {
                const cssRules = Array.from(styleSheet.cssRules).map(function (r) { return r.cssText; }).join('');
                if (!cssRules) return;
                const style = pip.document.createElement('style');
                style.textContent = cssRules;
                pip.document.head.appendChild(style);
            } catch (e) { /* file:// / CSP — taban CSS yeterli */ }
        });

        // SVG ikon sprite'ı kopyala — <use href="#..."> PiP belgesinde çözümlensin
        const sprite = document.querySelector('.icon-sprite');
        if (sprite) pip.document.body.insertBefore(sprite.cloneNode(true), pip.document.body.firstChild);
    }

    async function enterPip() {
        // Electron: bağımsız daima-üstte OpenView penceresi açılır (gerçek 'ayrı uygulama')
        if (Core.isElectron && Core.bridge && Core.bridge.openViewWindow) {
            ovWindowRequested = true;
            Core.bridge.openViewWindow(!!settings.overlayMode);
            if (rootEl) {
                isOpen = false;
                rootEl.classList.add('hidden');
                rootEl.classList.remove('open');
            }
            return;
        }
        if (!pipAvailable()) {
            ovToast('Bu ortam PiP desteklemiyor', 'error');
            return;
        }
        if (isPipActive()) return;

        try {
            const pip = await window.documentPictureInPicture.requestWindow({ width: 400, height: 520 });
            copyStylesToPip(pip);
            pip.document.title = 'OpenView — NesilAI';

            rootEl.classList.add('pip');
            // Sürükleme/serbest konum inline stilleri PiP'e TAŞINMASIN:
            // inline left/top, pip CSS'teki inset:0'ı ezer ve panel pencerenin
            // dışına savrulur ("PiP bozuk" hatasının kök nedeni). CSS !important
            // da güvence olarak ekli; bu temizlik ekstra garanti.
            rootEl.style.left = '';
            rootEl.style.top = '';
            rootEl.style.right = '';
            rootEl.style.bottom = '';
            pip.document.body.appendChild(rootEl);
            isOpen = true; // durum senkronu: panel artık pip belgesinde

            // Panel taşındı → menü kapatma + kısayol dinleyicileri yeni belgeye de bağlanır
            // (ana belgedekiler bu pencerede hiç tetiklenmez)
            pip.document.addEventListener('click', onDocClick);
            pip.document.addEventListener('keydown', onDocKeydown);

            pipEnteredAt = Date.now();
            pip.addEventListener('pagehide', function () { exitPip(true); });

            // Beklenmedik pencere kapanmalarına karşı bekçi: 1.5 sn sonra panel
            // hâlâ ölü belgede sıkışmışsa ana belgeye kurtar.
            setTimeout(function () {
                if (rootEl && rootEl.ownerDocument !== document && !pipWindow()) {
                    returnPanelFromPip();
                }
            }, 1500);

            renderAnswer();
            updatePipButton();
            setTimeout(function () { if (inputEl) inputEl.focus(); }, 80);
            ovToast('OpenView artık ekranda daima üstte 📌');
        } catch (e) {
            ovToast('PiP açılamadı: ' + ((e && e.message) || 'bilinmeyen hata'), 'error');
        }
    }

    // ========================================================
    // Kayıp panel kurtarma — PiP penceresi kapanırken tarayıcı
    // documentPictureInPicture.window'u ÇOKTAN null yapabilir;
    // eski kod bu durumda erken dönüp paneli ölü belgede terk
    // ediyordu ("PiP çalışmıyor" hatasının kök nedeni).
    // ========================================================
    function returnPanelFromPip() {
        if (!rootEl) return;
        if (rootEl.ownerDocument === document) return; // zaten evde
        rootEl.classList.remove('pip');
        document.body.appendChild(rootEl);
        applySettings();
        renderAnswer();
        updatePipButton();
        if (!isOpen) rootEl.classList.add('hidden');
    }

    function exitPip(closedByUser) {
        if (!rootEl) return;

        // PiP açıldıktan hemen sonra bazı ortamlar boşundan pagehide tetikler;
        // yoksa panel geri taşınır ve pencere boş arka plan olarak kalır.
        if (closedByUser && Date.now() - pipEnteredAt < 500) return;

        const pip = pipWindow();
        if (pip) {
            if (!closedByUser) {
                // Biz kapatıyoruz → pagehide returnPanel'i tetikler.
                // pagehide atlanırsa diye güvenlik ağı da kurulur.
                pip.close();
                setTimeout(returnPanelFromPip, 300);
            } else {
                // Kullanıcı pencereyi kapatıyor; kapanma bitince paneli al.
                setTimeout(returnPanelFromPip, 300);
            }
            return;
        }

        // pipWindow() zaten null → pencere kapandı/kriz anı: paneli hemen kurtar
        returnPanelFromPip();
    }

    function togglePip() {
        if (isPipActive()) exitPip(false);
        else enterPip();
    }

    function updatePipButton() {
        const btn = rootEl && rootEl.querySelector('#ov-pip-btn');
        if (btn) btn.classList.toggle('active', isPipActive());
    }

    /** Panelin etkin belgesi — PiP'teyken seçim ekranı da orada açılmalı */
    function activeHostDoc() {
        return (isPipActive() && pipWindow()) ? pipWindow().document : document;
    }

    // ========================================================
    // Şeffaf overlay modu (Electron) — boş alanlardan tıklar masaüstüne geçer
    // ========================================================
    function bindOverlayClickThrough() {
        if (!Core.isElectron || !Core.bridge || !Core.bridge.setClickThrough) return;
        let through = false;
        document.addEventListener('mousemove', function (e) {
            // Panelin ÜZERİNDE miyiz? Değilsek tıklamaları geçeriz.
            const t = e.target;
            const overPanel = !!(t && t.closest && t.closest('.openview'));
            const want = !overPanel;
            if (want !== through) {
                through = want;
                try { Core.bridge.setClickThrough(through); } catch (err) { /* yoksay */ }
            }
        });
    }

    // ========================================================
    // Sürükleme — başlıktan tutup paneli ekranın istenen yerine taşı
    // ========================================================
    function enableDrag() {
        const head = rootEl.querySelector('.ov-head');
        let dragging = false, startX = 0, startY = 0, origLeft = 0, origTop = 0;

        head.addEventListener('pointerdown', function (e) {
            if (isPipActive()) return; // PiP'te pencere zaten sabit
            if (e.target.closest('button')) return; // düğmeler sürüklemesin
            dragging = true;
            startX = e.clientX; startY = e.clientY;
            const rect = rootEl.getBoundingClientRect();
            origLeft = rect.left; origTop = rect.top;
            try { head.setPointerCapture(e.pointerId); } catch (err) { /* yoksay */ }
        });

        head.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            const w = rootEl.offsetWidth, h = rootEl.offsetHeight;
            let nx = origLeft + (e.clientX - startX);
            let ny = origTop + (e.clientY - startY);
            // Görünür alan içinde tut
            nx = Math.max(8, Math.min(window.innerWidth - w - 8, nx));
            ny = Math.max(8, Math.min(window.innerHeight - h - 8, ny));
            rootEl.style.left = nx + 'px';
            rootEl.style.top = ny + 'px';
            rootEl.style.right = 'auto';
            rootEl.style.bottom = 'auto';
        });

        function endDrag() {
            if (!dragging) return;
            dragging = false;
            settings.panelPos = { left: rootEl.style.left, top: rootEl.style.top };
            Core.saveSettings();
        }
        head.addEventListener('pointerup', endDrag);
        head.addEventListener('pointercancel', endDrag);

        // Çift tıklama → köşe varsayılanına dön
        head.addEventListener('dblclick', function () {
            settings.panelPos = null;
            Core.saveSettings();
            applySettings();
        });
    }

    // ========================================================
    // Aç / Kapat / Komutlar
    // ========================================================
    function isOpenView() {
        // Electron ana penceresinde bağımsız pencere durumunu yerel bayrak taşır;
        // pencere dışarıdan kapatılırsa 'openview:window-closed' olayı bayrağı düşürür.
        if (Core.isElectron && !OV_WINDOW_MODE && ovWindowRequested) return true;
        return isOpen && rootEl && !rootEl.classList.contains('hidden');
    }

    function openView() {
        // Electron ana penceresi: OpenView'ı bağımsız pencere olarak aç
        // (istek: ayrı uygulama, file:// panel hilesi yok)
        // settings.overlayMode açıksa şeffaf tık-geçiren overlay penceresi açılır.
        if (Core.isElectron && !OV_WINDOW_MODE && Core.bridge && Core.bridge.openViewWindow) {
            ovWindowRequested = true;
            Core.bridge.openViewWindow(!!settings.overlayMode);
            return;
        }
        buildDom();
        isOpen = true;
        rootEl.classList.remove('hidden');
        rootEl.classList.add('open');
        closeSettings();
        renderAnswer();
        updateStatusDots();
        setTimeout(function () { inputEl && inputEl.focus(); }, 80);
        if (!SC.isActive()) connectScreen();
    }

    function closeView() {
        // Önce durumu düşür: pagehide anında exitPip paneli gizleyebilsin
        isOpen = false;
        if (OV_WINDOW_MODE) {
            // Bu pencerenin kendisi bağımsız OpenView uygulaması → kendini kapat
            if (Core.bridge && Core.bridge.closeOpenViewWindow) {
                Core.bridge.closeOpenViewWindow();
            } else {
                window.close();
            }
            return;
        }
        if (Core.isElectron && Core.bridge && Core.bridge.closeOpenViewWindow) {
            // Ana pencereden kapatma: bağımsız OpenView penceresini kapat.
            // NOT: panel ana pencerede hiç açılmamış olabilir (rootEl yok) —
            // bu yüzden pencere kapatma, rootEl guard'ından ÖNCE yapılır.
            ovWindowRequested = false;
            Core.bridge.closeOpenViewWindow();
            return;
        }
        if (!rootEl) return;

        if (rootEl.ownerDocument !== document) {
            // Panel PiP belgesinde → PENCEREYİ kapat (pagehide paneli geri taşır).
            // Önce paneli geri taşırsak isPipActive() false düşer ve pencere
            // boş şekilde açık kalırdı (Web ✕ hatası). Pencere önce kapanır.
            const pw = pipWindow();
            if (pw) { try { pw.close(); } catch (e) { /* yoksay */ } }
            // pagehide atlanırsa diye güvenlik ağı: paneli kurtar + her şeyi durdur
            setTimeout(function () {
                if (rootEl && rootEl.ownerDocument !== document) returnPanelFromPip();
                if (rootEl) { rootEl.classList.add('hidden'); rootEl.classList.remove('open'); }
                stopActive();
                if (micActive) toggleMic();
                if (SC.isActive()) SC.stop();
                updateStatusDots();
            }, 350);
            return;
        }

        closeAskMenu();
        closeSettings();
        rootEl.classList.add('hidden');
        rootEl.classList.remove('open');
        stopActive();
        if (micActive) toggleMic();
        // Ekran bağlantısı da kapatılır — izin göstergesi sönmesin diye
        if (SC.isActive()) SC.stop();
        updateStatusDots();
    }

    function toggleOpenView() {
        if (isOpenView()) closeView();
        else openView();
    }

    /** Pencere modunda isOpenView senkron IPC'ye bakar; panel durumundan bağımsız */

    /** /openview komut rotalayıcısı — app.js çağırır. null ise normal akış devam eder. */
    function handleCommand(cmd, body) {
        const arg = String(body || '').trim().toLowerCase();

        if (!Core.isDesktopPlatform) return Core.PC_ONLY_MESSAGE;

        if (arg === 'off') {
            if (isOpenView()) closeView();
            return 'OpenView kapatıldı. 🔒 Tekrar açmak için `/openview` yaz.';
        }
        if (arg === 'settings') {
            if (!isOpenView()) openView();
            openSettings();
            return 'OpenView ayarları açıldı — mikrofon, sesli yanıt, monitör, analiz kalitesi ve arayüz tercihlerini oradan yönetebilirsin.';
        }
        if (arg === 'on' || arg === '') {
            if (isOpenView()) {
                closeView();
                return 'OpenView kapatıldı. Tekrar açmak için `/openview` yaz.';
            }
            openView();
            return 'OpenView açık — ekranın canlı olarak izleniyor. 🖥️\n\n' +
                '- Bir şey sormak için alttaki kutuya yaz\n' +
                '- **Ekrandakini Sor** ile tüm ekranı ya da seçeceğin bir bölgeyi analiz ettir\n' +
                '- Kapatmak için sağ üstteki ✕ ya da `/openview`';
        }
        return 'Bilinmeyen OpenView komutu. Kullanım: `/openview`, `/openview on`, `/openview off`, `/openview settings`.';
    }

    function getCommandHelp() {
        return '- `/openview` — ekran asistanını açar/kapatır (yalnızca PC)\n' +
               '- `/openview off` — OpenView\'ı kapatır\n' +
               '- `/openview settings` — OpenView ayarlarını açar';
    }

    // ========================================================
    // Durum göstergeleri (● Ekran Aktif / ● Mikrofon Aktif)
    // ========================================================
    function updateStatusDots() {
        if (!statusScreen || !statusMic) return;
        statusScreen.classList.toggle('on', SC.isActive());
        statusScreen.classList.toggle('off', !SC.isActive());
        statusMic.classList.toggle('on', micActive);
        statusMic.classList.toggle('off', !micActive);
    }

    // ========================================================
    // Olaylar
    // ========================================================
    function autoGrow(ta) {
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 110) + 'px';
    }

    function onDocClick(e) {
        if (!isOpenView()) return;
        if (askWrap && !askWrap.contains(e.target)) closeAskMenu();
        if (settingsPop && !settingsPop.classList.contains('hidden') &&
            !settingsPop.contains(e.target) &&
            e.target !== rootEl.querySelector('#ov-settings-btn') &&
            !rootEl.querySelector('#ov-settings-btn').contains(e.target)) {
            closeSettings();
        }
    }

    function onDocKeydown(e) {
        const sc = settings.shortcut;
        if (!sc || sc === 'off') return;
        const match =
            (sc === 'Alt+O' && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyO') ||
            (sc === 'Ctrl+Alt+O' && e.ctrlKey && e.altKey && e.code === 'KeyO') ||
            (sc === 'Ctrl+Shift+O' && e.ctrlKey && e.shiftKey && e.code === 'KeyO');
        if (match) {
            e.preventDefault();
            toggleOpenView();
        }
    }

    function bindEvents() {
        // DİKKAT: başlıkta İKİ .ov-close düğmesi var (📌 pip + ✕ kapat).
        // querySelector('.ov-close') İLKİNİ (pip'i) döndürür — v1'de closeView
        // yanlışlıkla PiP düğmesine bağlıydı; ✕'in dinleyicisi hiç yoktu.
        // Artık id ile bağlanıyor: ✕ → closeView, 📌 → togglePip.
        rootEl.querySelector('#ov-close-btn').addEventListener('click', closeView);
        rootEl.querySelector('#ov-pip-btn').addEventListener('click', togglePip);
        enableDrag();

        sendBtn.addEventListener('click', sendCurrent);
        stopBtn.addEventListener('click', stopActive);
        micBtn.addEventListener('click', function () { toggleMic('main'); });
        askMicBtn.addEventListener('click', function () { toggleMic('ask'); });

        rootEl.querySelector('#ov-ask-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            toggleAskMenu();
        });
        rootEl.querySelector('#ov-ask-full').addEventListener('click', function () { askScreen(false); });
        rootEl.querySelector('#ov-ask-region').addEventListener('click', function () { askScreen(true); });
        rootEl.querySelector('#ov-settings-btn').addEventListener('click', function (e) {
            e.stopPropagation();
            toggleSettings();
        });

        // Menü/ayar dışına tıklayınca kapat — panel PiP'e taşındığında da
        // çalışsın diye işleyici adlı fonksiyon; PiP belgesine de bağlanır.
        document.addEventListener('click', onDocClick);

        // Mesaj girişi: Enter gönder, Shift+Enter satır
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendCurrent();
            }
        });
        inputEl.addEventListener('input', function () { autoGrow(inputEl); });

        askInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                askScreen(false);
            }
        });

        // Kısayol — aynı şekilde PiP belgesinde de geçerli olmalı
        document.addEventListener('keydown', onDocKeydown);
    }

    // ========================================================
    // Dışa Aktarım
    // ========================================================
    window.NesilOpenView = {
        isOpen: isOpenView,
        open: openView,
        close: closeView,
        toggle: toggleOpenView,
        handleCommand: handleCommand,
        getCommandHelp: getCommandHelp,
        isPip: isPipActive,
        togglePip: togglePip,
        recoverPip: returnPanelFromPip, // test/hata ayıklama: paneli PiP'ten zorla kurtar
        pipCriticalCss: PIP_BASE_CSS
    };

    // Ana pencere (Electron): bağımsız OpenView penceresi dışarıdan kapatılırsa
    // panel durumunu senkronla (gizli panel 'açık' sanmasın)
    if (Core.isElectron && Core.bridge && Core.bridge.onOpenViewWindowClosed && !OV_WINDOW_MODE) {
        Core.bridge.onOpenViewWindowClosed(function () {
            ovWindowRequested = false;
            if (rootEl && isOpen && !isPipActive()) {
                isOpen = false;
                rootEl.classList.add('hidden');
                rootEl.classList.remove('open');
            }
        });
    }

    // PC'de kenar çubuğu düğmesini görünür kıl (mobil/tablet gizli kalır)
    if (Core.isDesktopPlatform || OV_WINDOW_MODE) {
        document.body.classList.add('openview-ready');
    }

    // Kenar çubuğu OpenView düğmesi: 1. basış açar, 2. basış kapatır.
    // NOT: buildDom lazy olduğu için burada (modül kapanışında, bir kez) bağlanır.
    (function () {
        const headerBtn = document.getElementById('open-openview-btn');
        if (headerBtn) headerBtn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleOpenView();
        });
    })();

    // Otomatik başlangıç (yalnızca Electron + ayar açıksa)
    if (Core.isElectron && settings.autoStart) {
        setTimeout(function () {
            try {
                if (OV_WINDOW_MODE) return; // zaten OpenView penceresi
                if (Core.bridge && Core.bridge.openViewWindow) Core.bridge.openViewWindow(!!settings.overlayMode);
                else openView();
            } catch (e) { console.warn('OpenView otomatik başlatılamadı', e); }
        }, 1200);
    }

    // ========================================================
    // Bağımsız OpenView pencere modu (Electron ?ovwindow=1)
    // --------------------------------------------------------
    // Panel tam pencereyi doldurur; sohbet/ekran köprüsü aynı çalışır.
    // Ana pencere "OpenView penceresi kapandı" derse sessizce durum senkronlar.
    // ========================================================
    if (OV_WINDOW_MODE && Core.isElectron && Core.bridge) {
        setTimeout(function () {
            try { openView(); } catch (e) { /* panel zaten açıksa sorun değil */ }
        }, 150);
        if (Core.bridge.onOpenViewWindowClosed) {
            Core.bridge.onOpenViewWindowClosed(function () { /* bu pencere kapandı — ana pencere senkronlar */ });
        }
    }

})();
