/* ========================================================
   NesilAI — Speech to Text (STT) Motoru v2
   --------------------------------------------------------
   Motor zinciri:
     1) Web Speech API (Chrome/Edge/Android — anahtarsız, canlı)
     2) Yerel Whisper (transformers.js, WASM) — Web Speech'in
        olmadığı/çalışmadığı ortamlar için: Electron PC, Firefox,
        iOS Safari tuhaflıkları. Anahtar yok, tamamen yerel çalışır
        (model ilk kullanımda CDN'den indirilir, sonra önbellek).

   v2 düzeltmeleri:
     - "not-allowed" sonrası sonsuz yeniden başlatma döngüsü öldürüldü
       (PC & mobilde mikrofonun kilitlenip pili yakmasının sebebi)
     - Ölümcül hatalarda otomatik Whisper yedeği
     - İzin/mikrofon ön kontrolü + kullanıcıya anlamlı tanılama
     - Restart'a 250 ms geri çekilme (InvalidStateError önlemi)
   ======================================================== */
(function () {
    'use strict';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // --- motor durumları ---
    let recognition = null;
    let isListeningState = false;
    let shouldKeepListening = false;
    let currentCallbacks = {};
    let lastFatalError = null;
    let restartCount = 0;
    let restartTimer = null;

    // Whisper motor durumu
    let whPipe = null;
    let whLoading = null;
    let whAbort = null;         // aktif kayıt oturumunun iptal denetleyicisi
    let whStream = null;        // MediaStream
    let whCtx = null;
    let whProcessor = null;
    let whSource = null;
    let whBuffer = [];

    const FATAL_WEB_SPEECH = ['not-allowed', 'service-not-allowed', 'audio-capture'];

    // ========================================================
    // Destek & Tanılama
    // ========================================================
    function isSupported() {
        // Web Speech ya da yerel Whisper yedeği varsa destekleniyor sayılır.
        // Whisper yalnızca güvenli bağlamda (https / file:// / localhost) çalışır.
        const secure = window.isSecureContext !== false;
        return !!SpeechRecognition || !!secure;
    }

    function hasWebSpeech() { return !!SpeechRecognition; }

    /**
     * Mikrofonun bu ortamda çalışıp çalışmayacağını ve neden çalışmayacağını söyler.
     * → { ok, reason, message, engine }
     */
    async function diagnose() {
        const secure = window.isSecureContext !== false;
        if (!secure) {
            return {
                ok: false,
                reason: 'insecure',
                engine: null,
                message: 'Mikrofon tarayıcıda yalnızca HTTPS (veya localhost) üzerinde çalışır. ' +
                    'Siteyi https:// ile aç ya da masaüstü uygulamayı kullan.'
            };
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return {
                ok: false, reason: 'no-api', engine: null,
                message: 'Bu tarayıcı mikrofon API\u2019sini (getUserMedia) desteklemiyor.'
            };
        }
        // İzin durumunu oku (mümkünse)
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const st = await navigator.permissions.query({ name: 'microphone' });
                if (st.state === 'denied') {
                    return {
                        ok: false, reason: 'permission', engine: null,
                        message: 'Mikrofon izni reddedilmiş. Adres çubuğundaki kilit/izn menüsünden mikrofona izin ver.'
                    };
                }
            }
        } catch (e) { /* permissions API yok — sorun değil */ }

        const engine = hasWebSpeech() ? 'webspeech' : 'whisper';
        return { ok: true, reason: null, engine: engine, message: 'Mikrofon hazır (' + engine + ')' };
    }

    // İzin ön kontrolü — Whisper motoru kendi açar; Web Speech kendisi yönetir.
    async function preflightMic() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Mikrofon API\u2019si bu ortamda yok.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop()); // hemen bırak — sadece izin testi
    }

    // ========================================================
    // Motor 1: Web Speech API
    // ========================================================
    function startWebSpeech(callbacks) {
        stop();

        currentCallbacks = callbacks;
        shouldKeepListening = callbacks.continuous !== false;
        lastFatalError = null;
        restartCount = 0;

        try {
            recognition = new SpeechRecognition();
            recognition.continuous = shouldKeepListening;
            recognition.interimResults = true;
            recognition.lang = callbacks.language || 'tr-TR';

            recognition.onstart = () => {
                isListeningState = true;
                if (currentCallbacks.onStart) currentCallbacks.onStart();
            };

            recognition.onresult = (event) => {
                let interim = '';
                let final = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        final += transcript;
                    } else {
                        interim += transcript;
                    }
                }

                if (final && currentCallbacks.onFinal) {
                    currentCallbacks.onFinal(final.trim());
                }
                if (interim && currentCallbacks.onInterim) {
                    currentCallbacks.onInterim(interim);
                }
            };

            recognition.onerror = (event) => {
                const code = event.error;
                if (code === 'no-speech') return; // sessizlik — normal

                const fatal = FATAL_WEB_SPEECH.indexOf(code) !== -1 || code === 'network';
                if (fatal) {
                    lastFatalError = code;
                    shouldKeepListening = false; // döngüyü kes
                    isListeningState = false;
                }
                console.warn('STT uyarısı:', code);
                if (currentCallbacks.onError) currentCallbacks.onError(event);
            };

            recognition.onend = () => {
                // Ölümcül hata sonrası ASLA yeniden başlatma (v1'deki pil yakan döngü)
                if (!shouldKeepListening || !isListeningState || lastFatalError) {
                    isListeningState = false;
                    if (currentCallbacks.onEnd) currentCallbacks.onEnd();
                    // Web Speech ölümcül şekilde düştüyse Whisper yedeği devreye girsin
                    if (lastFatalError && currentCallbacks.onFatal) {
                        const cb = currentCallbacks; currentCallbacks = {};
                        cb.onFatal(lastFatalError);
                    }
                    return;
                }
                // Sessizlik/radar sonu: kısa geri çekilmeyle devam
                if (restartCount++ > 60) { // ~dakikada makul üst sınır
                    isListeningState = false;
                    if (currentCallbacks.onEnd) currentCallbacks.onEnd();
                    return;
                }
                clearTimeout(restartTimer);
                restartTimer = setTimeout(() => {
                    if (!shouldKeepListening || !recognition) return;
                    try { recognition.start(); }
                    catch (e) { isListeningState = false; if (currentCallbacks.onEnd) currentCallbacks.onEnd(); }
                }, 250);
            };

            recognition.start();
            return true;
        } catch (error) {
            console.error('STT Başlatma Hatası:', error);
            if (callbacks.onError) callbacks.onError(error);
            return false;
        }
    }

    // ========================================================
    // Motor 2: Yerel Whisper (Electron / Web Speech'siz ortamlar)
    // ========================================================
    const WHISPER_MODEL = 'Xenova/whisper-tiny'; // çok dilli, ~40 MB (q8)

    async function ensureWhisper(onProgress) {
        if (whPipe) return whPipe;
        if (!whLoading) {
            whLoading = (async () => {
                const mod = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5');
                mod.env.allowLocalModels = false;
                whPipe = await mod.pipeline('automatic-speech-recognition', WHISPER_MODEL, {
                    dtype: 'q8',
                    progress_callback: onProgress || null
                });
                return whPipe;
            })();
            try { return await whLoading; }
            catch (e) { whLoading = null; whPipe = null; throw e; }
        }
        return whLoading;
    }

    // Ses örneklemini 16 kHz monoya indirir (AudioContext oranı cihazdan gelir)
    function downsampleTo16k(input, inputRate) {
        const target = 16000;
        if (inputRate === target) return input;
        const ratio = inputRate / target;
        const outLen = Math.floor(input.length / ratio);
        const out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const idx = i * ratio;
            const i0 = Math.floor(idx);
            const frac = idx - i0;
            const a = input[i0] || 0;
            const b = input[i0 + 1] || a;
            out[i] = a + (b - a) * frac;
        }
        return out;
    }

    async function startWhisper(callbacks) {
        if (!window.isSecureContext) {
            if (callbacks.onError) callbacks.onError({ error: 'insecure' });
            return false;
        }
        stop();

        currentCallbacks = callbacks;
        shouldKeepListening = callbacks.continuous !== false;

        try {
            // 1) Mikrofonu aç
            whStream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
            });

            // 2) 16 kHz mümkünse doğrudan; değilse cihaz oranı + downsample
            let ctx;
            try { ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 }); }
            catch (e) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
            whCtx = ctx;
            whSource = ctx.createMediaStreamSource(whStream);
            whBuffer = [];

            // ScriptProcessor: eskimiş ama her yerde çalışır (AudioWorklet file:// uyumsuzluklarından kaçınır)
            whProcessor = ctx.createScriptProcessor(4096, 1, 1);
            whProcessor.onaudioprocess = (ev) => {
                if (!isListeningState) return;
                const input = ev.inputBuffer.getChannelData(0);
                whBuffer.push(new Float32Array(downsampleTo16k(input, ctx.sampleRate)));
                // Ses seviyesi göstergesi (isteğe bağlı)
                if (currentCallbacks.onLevel) {
                    let sum = 0;
                    for (let i = 0; i < input.length; i += 8) sum += input[i] * input[i];
                    currentCallbacks.onLevel(Math.sqrt(sum / (input.length / 8)));
                }
            };
            whSource.connect(whProcessor);
            whProcessor.connect(ctx.destination);

            // 3) Modeli arka planda hazırla (ilk kullanımda iner)
            isListeningState = true;
            if (currentCallbacks.onStart) currentCallbacks.onStart();
            ensureWhisper((p) => { if (currentCallbacks.onWhisperProgress) currentCallbacks.onWhisperProgress(p); })
                .catch((e) => {
                    console.warn('Whisper modeli yüklenemedi:', e);
                    if (currentCallbacks.onError) currentCallbacks.onError({ error: 'model-load', detail: e && e.message });
                });

            // 4) Uzun kayıtta canlılığı koru: her 12 saniyede ara transkript
            whSegmentLoop();
            return true;
        } catch (error) {
            const name = error && (error.name || error.error);
            console.error('Whisper STT başlatma hatası:', error);
            const mapped = (name === 'NotAllowedError') ? 'not-allowed'
                : (name === 'NotFoundError') ? 'audio-capture' : 'mic-error';
            if (callbacks.onError) callbacks.onError({ error: mapped, detail: error && error.message });
            cleanupWhisperCapture();
            return false;
        }
    }

    // 12 saniyelik segmentler ara sonucu besler; final stop()'ta üretilir
    let whSegmentAt = 0;
    function whSegmentLoop() {
        clearTimeout(whSegmentAt);
        whSegmentAt = setTimeout(async () => {
            if (!isListeningState) return;
            const seg = takeWhisperAudio();
            if (seg && seg.length >= 16000 && whPipe) {
                transcribeWhisper(seg).then(txt => {
                    if (txt && currentCallbacks.onInterim) currentCallbacks.onInterim(txt);
                }).catch(() => {});
            }
            if (isListeningState) whSegmentLoop();
        }, 12000);
    }

    function takeWhisperAudio() {
        if (!whBuffer.length) return null;
        const total = whBuffer.reduce((n, c) => n + c.length, 0);
        const merged = new Float32Array(total);
        let off = 0;
        whBuffer.forEach(c => { merged.set(c, off); off += c.length; });
        whBuffer = [];
        return merged;
    }

    async function transcribeWhisper(audio) {
        const pipe = await ensureWhisper((p) => { if (currentCallbacks.onWhisperProgress) currentCallbacks.onWhisperProgress(p); });
        const out = await pipe(audio, { language: 'turkish', task: 'transcribe' });
        return (out && out.text ? out.text : '').trim();
    }

    function cleanupWhisperCapture() {
        clearTimeout(whSegmentAt);
        try { if (whProcessor) whProcessor.disconnect(); } catch (e) {}
        try { if (whSource) whSource.disconnect(); } catch (e) {}
        try { if (whCtx && whCtx.state !== 'closed') whCtx.close(); } catch (e) {}
        try { if (whStream) whStream.getTracks().forEach(t => t.stop()); } catch (e) {}
        whProcessor = null; whSource = null; whCtx = null; whStream = null;
    }

    // ========================================================
    // Genel API (v1 ile birebir uyumlu + ekstralar)
    // ========================================================
    function start(callbacks = {}) {
        if (!isSupported()) {
            if (callbacks.onError) {
                callbacks.onError({ error: 'unsupported', message: 'Bu ortamda konuşma tanıma desteklenmiyor.' });
            }
            return false;
        }

        if (hasWebSpeech()) {
            // Web Speech ölümcül hata verirse (Electron'da Google servisleri
            // kapalı olur → 'network'/'not-allowed') Whisper devralır.
            const wrapped = Object.assign({}, callbacks, {
                onFatal: function (code) {
                    if (callbacks.onEngineFallback) callbacks.onEngineFallback(code);
                    startWhisper(Object.assign({}, callbacks, {
                        onStart: function () {
                            if (callbacks.onEngineFallbackNotice) callbacks.onEngineFallbackNotice(code);
                            if (callbacks.onStart) callbacks.onStart();
                        }
                    }));
                }
            });
            return startWebSpeech(wrapped);
        }
        return startWhisper(callbacks);
    }

    function stop() {
        clearTimeout(restartTimer);
        shouldKeepListening = false;
        isListeningState = false;

        if (recognition) {
            try { recognition.stop(); } catch (e) {}
            recognition = null;
        }
        if (whStream) {
            const cb = currentCallbacks;
            const audio = takeWhisperAudio();
            cleanupWhisperCapture();
            // Kapanışta biriken sesi transkript et (push-to-talk davranışı)
            if (audio && audio.length >= 16000) {
                transcribeWhisper(audio).then(txt => {
                    if (txt && cb.onFinal) cb.onFinal(txt);
                    if (cb.onEnd) cb.onEnd();
                }).catch(() => { if (cb.onEnd) cb.onEnd(); });
            } else {
                if (cb.onEnd) cb.onEnd();
            }
        }
    }

    function isListening() {
        return isListeningState;
    }

    window.NesilSTT = {
        isSupported,
        start,
        stop,
        isListening,
        // v2 ekstraları
        diagnose,
        hasWebSpeech,
        get engine() {
            if (whStream) return 'whisper';
            if (recognition) return 'webspeech';
            return null;
        }
    };

})();
