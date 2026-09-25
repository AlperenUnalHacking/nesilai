/* ========================================================
   NesilAI — Medya Motoru (Ses / Müzik / Video Üretimi)
   --------------------------------------------------------
   1) Pollinations gen.pollinations.ai bulut modelleri
      (kokoro, ElevenLabs, Lyria, Stable Audio, Seedance…)
      Anahtarsız denenir; kota bitmişse Ayarlar'daki
      Pollinations anahtarıyla denenir.
   2) Bulut tıkalıysa müzik için tarayıcıda gerçek sentez
      (WebAudio prosedürel müzik motoru) — HER ZAMAN çalışır,
      6 tarz, şarkı yapısı (intro/vers/nakarat/outro).
   Video bulut ister; kota bitince dürüst Türkçe hata döner.
   ======================================================== */
(function () {
    'use strict';

    const GEN_BASE = 'https://gen.pollinations.ai';

    // Ses üretim modelleri: konuşma (TTS) ve müzik bir arada.
    const AUDIO_MODELS = [
        { id: 'auto',                              label: 'Otomatik',          kind: 'Otomatik', note: 'Bulut; tıkalıysa cihazda sentez' },
        { id: 'hexgrad/kokoro-82m',                label: 'Kokoro TTS',        kind: 'Konuşma', note: 'Hızlı, doğal konuşma' },
        { id: 'x-ai/grok-tts',                     label: 'Grok TTS',          kind: 'Konuşma', note: 'xAI ses sentezi' },
        { id: 'openai/gpt-audio',                  label: 'OpenAI Audio',      kind: 'Konuşma', note: 'OpenAI ses modeli' },
        { id: 'elevenlabs/eleven-v3',              label: 'ElevenLabs v3',     kind: 'Konuşma', note: 'En doğal sesler' },
        { id: 'google/lyria-3-clip-preview',       label: 'Lyria 3 (Müzik)',   kind: 'Müzik',   note: 'Google müzik üretimi' },
        { id: 'stability-ai/stable-audio-3',       label: 'Stable Audio 3',    kind: 'Müzik',   note: 'Şarkı/enstrümantal' },
        { id: 'stability-ai/stable-audio-3-medium',label: 'Stable Audio 3 M',  kind: 'Müzik',   note: 'Hızlı müzik' },
        { id: 'fish-audio/s2.1-pro',               label: 'Fish Audio S2.1',   kind: 'Konuşma', note: 'İfade zengin konuşma' },
        { id: 'sesame/csm-1b',                     label: 'Sesame CSM',        kind: 'Konuşma', note: 'Konuşma modeli' }
    ];

    // Video üretim modelleri (yavaş olabilir — 1-3 dakika)
    const VIDEO_MODELS = [
        { id: 'auto',                          label: 'Otomatik',          note: 'İlk çalışan hızlı model' },
        { id: 'bytedance/seedance-2.0-mini',   label: 'Seedance 2.0 Mini',  note: 'Hızlı video' },
        { id: 'bytedance/seedance-2.0-fast',   label: 'Seedance 2.0 Fast',  note: 'Dengeli' },
        { id: 'alibaba/wan-2.2-fast',          label: 'Wan 2.2 Fast',       note: 'Alibaba hızlı' },
        { id: 'alibaba/wan-2.7',               label: 'Wan 2.7',            note: 'Yüksek kalite' },
        { id: 'bytedance/seedance-2.5',        label: 'Seedance 2.5',       note: 'Yeni nesil' },
        { id: 'x-ai/grok-imagine-video-1.5',   label: 'Grok Imagine 1.5',   note: 'xAI video' }
    ];

    function getPollinationsKey() {
        try {
            const s = JSON.parse(localStorage.getItem('nesilai_ai_settings_v1') || '{}');
            return (s.keys && s.keys.pollinations || '').trim();
        } catch (e) { return ''; }
    }

    /**
     * Hata yanıtlarını kullanıcı dostu Türkçe mesaja çevirir.
     */
    function mapError(status, bodyText) {
        let serverMsg = '';
        try {
            const j = JSON.parse(bodyText);
            serverMsg = (j.error && (j.error.message || j.error.code)) || j.message || '';
        } catch (e) { /* gövde JSON değil */ }
        if (status === 401 || status === 402 || status === 429) {
            return 'Pollinations ücretsiz havuzu şu an dolu. Ücretsiz anahtar alırsan kotan yükselir: ' +
                   'enter.pollinations.ai/keys → Ayarlar → Yapay Zeka → Pollinations alanına yapıştır. ' + (serverMsg ? '(' + serverMsg + ')' : '');
        }
        if (status === 404) return 'Model bulunamadı; liste güncellenmiş olabilir.';
        if (status >= 500) return 'Sağlayıcı sunucusu şu an yanıt vermiyor, birazdan tekrar dene.';
        return 'İstek başarısız (HTTP ' + status + ')' + (serverMsg ? ': ' + serverMsg : '');
    }

    /**
     * Ortak üretim akışı: GET ile ikili (binary) medya indirir.
     * HTTP 200 + JSON gövdesi = sunucu hatayı metin olarak döndü.
     */
    async function fetchBinary(path, signal) {
        const key = getPollinationsKey();
        const sep = path.includes('?') ? '&' : '?';
        const url = GEN_BASE + path + (key ? sep + 'key=' + encodeURIComponent(key) : '');
        const res = await fetch(url, { signal });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(mapError(res.status, body));
        }
        if (ct.includes('application/json')) {
            const body = await res.text();
            throw new Error(mapError(200, body) || 'Beklenmeyen yanıt alındı.');
        }
        const blob = await res.blob();
        if (!blob.size) throw new Error('Boş yanıt alındı, tekrar dene.');
        return URL.createObjectURL(blob);
    }

    function cloudText(text, model, signal) {
        return fetchBinary('/audio/' + encodeURIComponent(text) + '?model=' + encodeURIComponent(model), signal);
    }


    function cloudVideo(prompt, model, signal) {
        return fetchBinary('/image/' + encodeURIComponent(prompt) + '?model=' + encodeURIComponent(model) + '&nologo=true', signal);
    }

    // ========================================================
    // Cihaz Üzerinde Müzik Sentezi (WebAudio)
    // Bulut tıkandığında bile gerçek, dinlenebilir şarkı üretir.
    // ========================================================

    // Metinden müzikal parametreler çıkarır
    function analyzePrompt(text) {
        const lower = (text || '').toLowerCase();
        const styles = [
            { id: 'rap',    names: ['rap', 'beat', 'flow'],              bpm: 92,  scale: [0, 3, 5, 7, 10],      root: 45, drums: true,  swing: 0.12 },
            { id: 'rock',   names: ['rock', 'metal', 'gitar', 'guitar'], bpm: 132, scale: [0, 3, 5, 7, 10],      root: 40, drums: true,  swing: 0 },
            { id: 'pop',    names: ['pop', 'neşeli', 'neseli', 'mutlu', 'happy'], bpm: 118, scale: [0, 2, 4, 7, 9], root: 48, drums: true, swing: 0 },
            { id: 'ambient',names: ['ambiyans', 'ambient', 'sakin', 'rahat', 'meditation', 'spa', 'uyku', 'sleep'], bpm: 66, scale: [0, 2, 3, 7, 8], root: 43, drums: false, swing: 0 },
            { id: 'arabesk',names: ['arabesk', 'arabesk', 'hüzün', 'huzun', 'üzgün', 'uzgun', 'slow', 'romantik'], bpm: 76, scale: [0, 1, 4, 5, 7, 8, 11], root: 41, drums: true, swing: 0.08 },
            { id: 'elektronik', names: ['elektronik', 'electronic', 'techno', 'house', 'edm', 'synth', 'sentr'], bpm: 126, scale: [0, 2, 3, 7, 9], root: 44, drums: true, swing: 0 }
        ];
        let style = styles.find(s => s.names.some(n => lower.includes(n))) || styles[2];
        const bpmMatch = lower.match(/(\d{2,3})\s*(bpm|vuruş|vurus)/);
        const bpm = bpmMatch ? Math.min(180, Math.max(50, parseInt(bpmMatch[1], 10))) : style.bpm;
        const durMatch = lower.match(/(\d{1,2})\s*(saniye|sn|sec|second)/);
        const seconds = durMatch ? Math.min(60, Math.max(8, parseInt(durMatch[1], 10))) : 24;
        // Metnin kaba ruh hali: ünlü/üzgün kelimeler arabelleği minör'e çeker
        return { style, bpm, seconds, seed: hashString(text || 'nesilai') };
    }

    function hashString(s) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }

    // Deterministik rastgelelik: aynı istek → aynı şarkı
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    /**
     * Prosedürel şarkı üretir ve WAV blob URL'i döndürür.
     * Yapı: intro (4 bar) → A (8) → B (8) → outro (4); akor
     * ilerleyişi stile göre, perde stilenin gamından.
     */
    async function synthesizeSong(prompt) {
        const spec = analyzePrompt(prompt);
        const rnd = mulberry32(spec.seed);
        const sr = 22050;
        const beat = 60 / spec.bpm;
        const bar = beat * 4;
        const bars = 24;
        const total = Math.ceil((bars * bar + 1.5) * sr);
        const L = new Float32Array(total);
        const R = new Float32Array(total);

        const sc = spec.style.scale;
        const root = spec.style.root;
        const progressions = spec.style.id === 'arabesk' ? [[0, 3, 4, 2]] : [[0, 4, 2, 3], [0, 2, 3, 4], [3, 0, 4, 2]];
        const prog = progressions[Math.floor(rnd() * progressions.length)];

        function addNote(startSec, durSec, freq, gain, pan, type, decay) {
            const s0 = Math.floor(startSec * sr);
            const n = Math.floor(durSec * sr);
            for (let i = 0; i < n; i++) {
                const t = i / sr;
                const idx = s0 + i;
                if (idx >= total) break;
                const env = Math.min(1, t * 200) * Math.exp(-t * (decay || 3));
                let v = 0;
                if (type === 'pluck') {
                    v = (Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(4 * Math.PI * freq * t) + 0.12 * Math.sin(6 * Math.PI * freq * t)) * env;
                } else if (type === 'bass') {
                    v = (Math.sin(2 * Math.PI * freq * t) * 0.9 + 0.18 * Math.sin(4 * Math.PI * freq * t)) * Math.min(1, t * 400) * Math.exp(-t * 2.2);
                } else if (type === 'pad') {
                    v = (Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * freq * 1.005 * t) + 0.3 * Math.sin(2 * Math.PI * freq * 2 * t)) * Math.min(1, t * 3) * Math.exp(-t * 0.55) * 0.28;
                }
                L[idx] += v * gain * (1 - Math.max(0, pan)) * 0.5;
                R[idx] += v * gain * (1 + Math.min(0, pan)) * 0.5;
            }
        }

        function addDrum(startSec, kind) {
            const s0 = Math.floor(startSec * sr);
            if (kind === 'kick') {
                const n = Math.floor(0.14 * sr);
                for (let i = 0; i < n; i++) {
                    const t = i / sr; const idx = s0 + i;
                    if (idx >= total) break;
                    const f = 120 * Math.exp(-t * 22) + 42;
                    const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 16) * 0.85;
                    L[idx] += v; R[idx] += v;
                }
            } else if (kind === 'hat') {
                const n = Math.floor(0.05 * sr);
                for (let i = 0; i < n; i++) {
                    const t = i / sr; const idx = s0 + i;
                    if (idx >= total) break;
                    const v = (rnd() * 2 - 1) * Math.exp(-t * 70) * 0.16;
                    L[idx] += v * 0.8; R[idx] += v;
                }
            } else if (kind === 'snare') {
                const n = Math.floor(0.16 * sr);
                for (let i = 0; i < n; i++) {
                    const t = i / sr; const idx = s0 + i;
                    if (idx >= total) break;
                    const noise = (rnd() * 2 - 1) * Math.exp(-t * 24) * 0.3;
                    const tone = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30) * 0.22;
                    L[idx] += noise * 0.7 + tone; R[idx] += noise + tone * 0.7;
                }
            }
        }

        for (let b = 0; b < bars; b++) {
            const t0 = b * bar;
            const section = b < 4 ? 'intro' : b < 12 ? 'A' : b < 20 ? 'B' : 'outro';
            const chordDeg = prog[b % prog.length];
            const chordRoot = root + sc[chordDeg % sc.length] + (chordDeg >= sc.length ? 12 : 0);

            // Bas: her barın 1. ve 3. vuruşu
            if (section !== 'intro' || spec.style.drums === false) {
                addNote(t0, beat * 1.8, mtof(chordRoot - 12), 0.30, 0, 'bass');
                addNote(t0 + beat * 2, beat * 1.8, mtof(chordRoot - 12), 0.26, 0, 'bass');
            }

            // Pad akoru (her barda)
            if (section === 'intro' || section === 'outro' || spec.style.id === 'ambient') {
                [0, 2, 4].forEach((iv, k) => {
                    addNote(t0, bar * 0.98, mtof(chordRoot + sc[iv % sc.length] + (iv >= sc.length ? 12 : 0)), 0.5, (k - 1) * 0.4, 'pad');
                });
            }

            // Melodi: A ve B bölümlerinde; motif tekrarı ile şarkı hissi
            if (section === 'A' || section === 'B') {
                const motifSeed = section === 'A' ? 7 : 13;
                const mrnd = mulberry32(spec.seed + motifSeed);
                const notesPerBar = spec.style.id === 'ambient' ? 2 : 5;
                for (let nn = 0; nn < notesPerBar; nn++) {
                    const swingOff = (nn % 2 === 1 ? spec.style.swing * beat : 0);
                    const tN = t0 + nn * (beat * 4 / notesPerBar) + swingOff;
                    if (mrnd() < 0.82) {
                        const deg = sc[Math.floor(mrnd() * sc.length)];
                        const oct = mrnd() < 0.25 ? 12 : 0;
                        addNote(tN, beat * 0.9, mtof(root + 12 + deg + oct), 0.20, (mrnd() - 0.5) * 0.6, 'pluck', 4);
                    }
                }
            }

            // Davul
            if (spec.style.drums && section !== 'outro') {
                for (let bt = 0; bt < 4; bt++) {
                    const tB = t0 + bt * beat + (bt % 2 === 1 ? spec.style.swing * beat * 0.5 : 0);
                    if (bt === 0 || bt === 2) addDrum(tB, 'kick');
                    if (bt === 1 || bt === 3) addDrum(tB, 'snare');
                    addDrum(tB + beat / 2, 'hat');
                    if (spec.style.id === 'elektronik' || spec.style.id === 'rap') addDrum(tB + beat / 4, 'hat');
                }
            }
        }

        // Yumuşak başla/bitir + limit
        const fade = Math.floor(0.8 * sr);
        for (let i = 0; i < fade; i++) {
            const g = i / fade;
            L[i] *= g; R[i] *= g;
            L[total - 1 - i] *= g; R[total - 1 - i] *= g;
        }
        for (let i = 0; i < total; i++) {
            L[i] = Math.max(-1, Math.min(1, L[i]));
            R[i] = Math.max(-1, Math.min(1, R[i]));
        }

        return encodeWav(L, R, sr);
    }

    function encodeWav(L, R, sr) {
        const n = L.length;
        const buf = new ArrayBuffer(44 + n * 4);
        const dv = new DataView(buf);
        const wstr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
        wstr(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); wstr(8, 'WAVE');
        wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
        dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
        wstr(36, 'data'); dv.setUint32(40, n * 4, true);
        let off = 44;
        for (let i = 0; i < n; i++) {
            dv.setInt16(off, L[i] * 32767, true); off += 2;
            dv.setInt16(off, R[i] * 32767, true); off += 2;
        }
        return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    }

    /**
     * Müzik/ses üretimi: model 'auto' ise önce bulut (anahtarsız →
     * anahtarlı), tıkanırsa cihazda sentez. Somut model verilirse
     * yalnız bulut denenir.
     */
    async function generateMusic(prompt, model, signal) {
        if (model && model !== 'auto') {
            try { return await cloudText(prompt, model, signal); }
            catch (e) { return await synthesizeSong(prompt); }
        }
        try {
            return await cloudText(prompt, 'google/lyria-3-clip-preview', signal);
        } catch (e1) {
            try {
                return await cloudText(prompt, 'stability-ai/stable-audio-3-medium', signal);
            } catch (e2) {
                return await synthesizeSong(prompt); // her koşulda müzik çıkar
            }
        }
    }

    /**
     * Konuşma sentezi: bulut; tıkalırsa tarayıcı konuşma sentezine
     * yönlendiren açıklayıcı hata (app.js zaten WebAudio'suz TTS'e sahip).
     */
    // ========================================================
    // Yerel Kokoro (kokoro-js, WASM): anahtarsız GERÇEK ses dosyası
    // İlk kullanımda ~86 MB model CDN'den indirilir, sonra önbellekten
    // açılır. TR telaffuzu kısıtlı — Türkçe metinde cihaz TTS'i ön plandadır.
    // ========================================================
    var kokoroPromise = null;
    function getKokoro() {
        if (!kokoroPromise) {
            kokoroPromise = import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm')
                .then(m => m.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm' }))
                .catch(e => { kokoroPromise = null; throw e; });
        }
        return kokoroPromise;
    }

    var kokoroVoices = ['af_heart', 'af_bella', 'am_adam', 'am_michael', 'bf_emma', 'bm_george'];

    async function localKokoro(text, signal) {
        const tts = await getKokoro();
        if (signal && signal.aborted) throw new Error('İptal edildi');
        // Uzun metin kokoro'nun kendi splitter'ına akıtılır; tek wav döner
        const audio = await tts.generate(String(text || '').slice(0, 1200), { voice: 'af_heart' });
        const blob = audio.toBlob();
        if (!blob.size) throw new Error('Yerel ses üretimi boş döndü.');
        return URL.createObjectURL(blob);
    }

    async function generateSpeech(text, model, signal) {
        const isTr = /[çğıöşüÇĞİÖŞÜ]/.test(text || '') ||
            ((String(text || '').toLowerCase().match(/\b(bir|ve|bu|için|ile|çok|ama|gibi)\b/g) || []).length >= 2);
        // 1) Kullanıcı özel bulut modeli seçtiyse: bulut → kokoro → cihaz yönlendirmesi
        if (model && model !== 'auto') {
            try { return await cloudText(text, model, signal); }
            catch (e) {
                try { return await localKokoro(text, signal); }
                catch (e2) {
                    throw new Error(isTr
                        ? 'Ses modeli şu an yanıt vermiyor. Türkçe metni mesajın altındaki "Dinle" düğmesiyle (cihaz sesi) dinleyebilirsin.'
                        : 'Ses modeli şu an yanıt vermiyor, tekrar dene.');
                }
            }
        }
        // 2) auto: bulut kokoro (anahtar varsa) → yerel kokoro (herkes, gerçek dosya)
        try {
            return await cloudText(text, 'hexgrad/kokoro-82m', signal);
        } catch (e1) {
            try { return await localKokoro(text, signal); }
            catch (e2) {
                throw new Error(isTr
                    ? 'Ses motoru ilk kurulumunu tamamlayamadı (model ~86 MB, internet gerektirir). Türkçe metni "Dinle" düğmesiyle cihaz sesiyle dinleyebilirsin.'
                    : 'Ses motoru ilk kurulumunu tamamlayamadı (model ~86 MB, internet gerektirir). Tekrar dene.');
            }
        }
    }

    /**
     * Video: bulut zorunlu. 'auto' → hızlı modeller sırayla denenir.
     */
    async function generateVideo(prompt, model, signal) {
        if (model && model !== 'auto') return cloudVideo(prompt, model, signal);
        const chain = ['bytedance/seedance-2.0-mini', 'bytedance/seedance-2.0-fast', 'alibaba/wan-2.2-fast', 'x-ai/grok-imagine-video-1.5'];
        let lastErr;
        for (const m of chain) {
            try { return await cloudVideo(prompt, m, signal); }
            catch (e) { lastErr = e; }
        }
        throw lastErr || new Error('Video modelleri şu an kullanılamıyor.');
    }

    // ========================================================
    // Ses Efekti (SFX) Motoru — saf prosedürel sentez
    // "bozuk para düşme sesi" gibi istekler BULUTA GİTMEZ; cihazda
    // anında, anahtarsız, gerçekçi efekt üretir ve WAV döndürür.
    // ========================================================

    const FX_LIBRARY = [
        { id: 'coin',      names: ['bozuk para', 'madeni para', 'para düş', 'para düs', 'coin', 'jingle para', 'tıkırtı para'], label: 'Bozuk para düşme', emoji: '<svg class="icon" aria-hidden="true"><use href="#i-coin"/></svg>' },
        { id: 'door',      names: ['kapı gıcırt', 'kapi gicirt', 'gıcırt', 'gicirt', 'door creak', 'ahşap kapı'],  label: 'Kapı gıcırtısı',  emoji: '<svg class="icon" aria-hidden="true"><use href="#i-door"/></svg>' },
        { id: 'doorbell',  names: ['kapı zili', 'kapi zili', 'doorbell', 'zili çal'],                               label: 'Kapı zili',       emoji: '<svg class="icon" aria-hidden="true"><use href="#i-bell"/></svg>' },
        { id: 'knock',     names: ['kapı çal', 'kapi cal', 'tık tık kapı', 'knock', 'kapıya vur'],                  label: 'Kapı çalma',      emoji: '<svg class="icon" aria-hidden="true"><use href="#i-door"/></svg>' },
        { id: 'rain',      names: ['yağmur', 'yagmur', 'rain', 'sağanak', 'saganak'],                               label: 'Yağmur',          emoji: '<svg class="icon" aria-hidden="true"><use href="#i-rain"/></svg>' },
        { id: 'thunder',   names: ['gök gürültüsü', 'gok gurultusu', 'thunder', 'şimşek', 'simsek'],                label: 'Gök gürültüsü',   emoji: '<svg class="icon" aria-hidden="true"><use href="#i-thunder"/></svg>' },
        { id: 'wind',      names: ['rüzgar', 'ruzgar', 'wind', 'poyraz'],                                           label: 'Rüzgâr',          emoji: '<svg class="icon" aria-hidden="true"><use href="#i-wind"/></svg>' },
        { id: 'fire',      names: ['ateş çıtırt', 'ates citirt', 'şömine', 'somine', 'fire crackle', 'kor'],        label: 'Ateş çıtırtısı',  emoji: '<svg class="icon" aria-hidden="true"><use href="#i-fire"/></svg>' },
        { id: 'waves',     names: ['deniz', 'dalga', 'okyanus', 'wave', 'ocean', 'sahil', 'surf'],                  label: 'Deniz dalgaları', emoji: '<svg class="icon" aria-hidden="true"><use href="#i-wave"/></svg>' },
        { id: 'heartbeat', names: ['kalp atış', 'kalp atis', 'heartbeat', 'kalp sesi'],                             label: 'Kalp atışı',      emoji: '<svg class="icon" aria-hidden="true"><use href="#i-heart"/></svg>' },
        { id: 'clock',     names: ['tik tak', 'tık tak', 'saat tik', 'clock tick', 'sarkaç'],                       label: 'Saat tik-tak',    emoji: '<svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg>' },
        { id: 'bird',      names: ['kuş cıvıl', 'kus civil', 'cıvıltı', 'civiltil', 'bird chirp'],                  label: 'Kuş cıvıltısı',   emoji: '<svg class="icon" aria-hidden="true"><use href="#i-bird"/></svg>' },
        { id: 'cricket',   names: ['cırcır', 'circir', 'cricket', 'böcek sesi'],                                    label: 'Cırcır böceği',   emoji: '<svg class="icon" aria-hidden="true"><use href="#i-sfx"/></svg>' },
        { id: 'footsteps', names: ['ayak sesi', 'ayak adım', 'ayak adim', 'footstep', 'yürüme sesi'],               label: 'Ayak sesleri',    emoji: '<svg class="icon" aria-hidden="true"><use href="#i-foot"/></svg>' },
        { id: 'glass',     names: ['cam kırıl', 'cam kiril', 'glass break', 'şırıngırtı'],                          label: 'Cam kırılması',   emoji: '<svg class="icon" aria-hidden="true"><use href="#i-glass"/></svg>' },
        { id: 'car',       names: ['araba geç', 'araba gec', 'car pass', 'araç geç', 'lastik sesi'],                label: 'Araba geçişi',    emoji: '<svg class="icon" aria-hidden="true"><use href="#i-car"/></svg>' },
        { id: 'horn',      names: ['korna', 'horn', 'düt düt', 'araba korna'],                                      label: 'Araba kornası',   emoji: '<svg class="icon" aria-hidden="true"><use href="#i-horn"/></svg>' },
        { id: 'phone',     names: ['telefon çal', 'telefon cal', 'ringtone', 'cep zil', 'telefon zil'],             label: 'Telefon zili',    emoji: '<svg class="icon" aria-hidden="true"><use href="#i-phone-ring"/></svg>' },
        { id: 'notification', names: ['bildirim sesi', 'notification', 'ping sesi', 'mesaj sesi'],                  label: 'Bildirim sesi',   emoji: '<svg class="icon" aria-hidden="true"><use href="#i-notify"/></svg>' },
        { id: 'success',   names: ['başarı sesi', 'basari sesi', 'success sound', 'kazandın', 'doğru cevap sesi', 'fanfar'], label: 'Başarı fanfarı', emoji: '<svg class="icon" aria-hidden="true"><use href="#i-party"/></svg>' },
        { id: 'fail',      names: ['hata sesi', 'yanlış sesi', 'yanlis sesi', 'error sound', 'fail sound'],         label: 'Hata sesi',       emoji: '<svg class="icon" aria-hidden="true"><use href="#i-x-mark"/></svg>' },
        { id: 'whoosh',    names: ['vınlama', 'vinlama', 'whoosh', 'geçiş sesi'],                                   label: 'Vınlama (whoosh)', emoji: '<svg class="icon" aria-hidden="true"><use href="#i-wind"/></svg>' },
        { id: 'explosion', names: ['patlama', 'explosion', 'bomba', 'güm sesi', 'infilak'],                         label: 'Patlama',         emoji: '<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg>' },
        { id: 'laser',     names: ['lazer', 'laser', 'blaster', 'uzay silah'],                                      label: 'Lazer atışı',     emoji: '<svg class="icon" aria-hidden="true"><use href="#i-sfx"/></svg>' },
        { id: 'typing',    names: ['klavye sesi', 'yazı yazma sesi', 'typing sound', 'tuş sesi'],                   label: 'Klavye yazıyorum', emoji: '<svg class="icon" aria-hidden="true"><use href="#i-key"/></svg>' },
        { id: 'page',      names: ['sayfa çevirme', 'sayfa cevirme', 'kitap sesi', 'page turn', 'kağıt sesi'],      label: 'Sayfa çevirme',   emoji: '<svg class="icon" aria-hidden="true"><use href="#i-doc"/></svg>' },
        { id: 'water',     names: ['su damla', 'damlalık', 'damlalik', 'water drip', 'musluk damla'],               label: 'Su damlaları',    emoji: '<svg class="icon" aria-hidden="true"><use href="#i-water"/></svg>' },
        { id: 'applause',  names: ['alkış', 'alkis', 'applause', 'clap', 'tebrik sesi'],                            label: 'Alkışlar',        emoji: '<svg class="icon" aria-hidden="true"><use href="#i-party"/></svg>' },
        { id: 'laugh',     names: ['kahkaha', 'gülme sesi', 'gulme sesi', 'laugh'],                                 label: 'Kahkaha',         emoji: '<svg class="icon" aria-hidden="true"><use href="#i-party"/></svg>' },
        { id: 'crowd',     names: ['kalabalık', 'kalabalik', 'crowd', 'tribün', 'tribun', 'stadyum'],               label: 'Kalabalık coşkusu', emoji: '<svg class="icon" aria-hidden="true"><use href="#i-crowd"/></svg>' }
    ];

    /** Serbest metinden FX şablonunu bulur; en uzun anahtar kazanır */
    function matchFx(prompt) {
        const lower = String(prompt || '').toLowerCase();
        if (!lower) return null;
        let best = null, bestLen = 0;
        for (const fx of FX_LIBRARY) {
            for (const n of fx.names) {
                if (lower.includes(n) && n.length > bestLen) { best = fx; bestLen = n.length; }
            }
        }
        return best;
    }

    /**
     * FX sentezi: add(tSec, val, pan) tampona yazar; toplam süre (sn) döndürür.
     * rnd deterministik → aynı istek her zaman aynı sesi üretir.
     */
    function synthesizeFx(fxId, rnd, add, sr) {
        const noise = () => rnd() * 2 - 1;

        switch (fxId) {
            case 'coin': {
                const hits = 2 + Math.floor(rnd() * 3);
                let t = 0.05;
                for (let h = 0; h < hits; h++) {
                    const f0 = 2400 + rnd() * 1800;
                    const pan = (h === 0 ? -0.3 : h === 1 ? 0.4 : 0) + (rnd() - 0.5) * 0.2;
                    for (let i = 0; i < 0.012 * sr; i++) {
                        const tt = i / sr;
                        add(t + tt, noise() * Math.exp(-tt * 260) * 0.55, pan);
                    }
                    const decay = (h === hits - 1) ? 7 : 16;   // son para uzun çınlar
                    for (let i = 0; i < 0.55 * sr; i++) {
                        const tt = i / sr;
                        const env = Math.exp(-tt * decay);
                        const v = (Math.sin(2 * Math.PI * f0 * tt) * 0.5 +
                                   Math.sin(2 * Math.PI * f0 * 2.76 * tt) * 0.25 +
                                   Math.sin(2 * Math.PI * f0 * 5.4 * tt) * 0.12) * env * 0.5;
                        add(t + tt, v, pan);
                    }
                    t += 0.09 + rnd() * 0.12;
                }
                return t + 0.7;
            }
            case 'door': {
                const f0 = 340 + rnd() * 160;
                for (let i = 0; i < 1.1 * sr; i++) {
                    const t = i / sr;
                    const f = f0 * (1 + 0.4 * Math.sin(t * 7));
                    add(t, (Math.sin(2 * Math.PI * f * t) * 0.35 + noise() * 0.08) * Math.min(1, t * 30) * Math.exp(-t * 2.1), -0.2);
                }
                for (let i = 0; i < 0.09 * sr; i++) { const t = i / sr; add(1.12 + t, noise() * Math.exp(-t * 80) * 0.5, 0.2); }
                return 1.5;
            }
            case 'doorbell': case 'phone': {
                const seq = fxId === 'doorbell' ? [[0, 0.5], [0.62, 0.5]] : [[0, 0.35], [0.45, 0.35], [0.9, 0.35], [1.35, 0.35]];
                for (const [t0, len] of seq) {
                    for (let i = 0; i < len * sr; i++) {
                        const t = i / sr;
                        const f = fxId === 'doorbell' ? 830 : 1180;
                        add(t0 + t, (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 1.5 * t) * 0.4) * 0.22 * Math.sin(Math.PI * t / len), 0);
                    }
                }
                return fxId === 'doorbell' ? 1.6 : 2.1;
            }
            case 'knock': {
                for (let k = 0; k < 3; k++) {
                    const t0 = k * 0.32;
                    for (let i = 0; i < 0.07 * sr; i++) {
                        const t = i / sr;
                        add(t0 + t, (Math.sin(2 * Math.PI * 140 * t) * 0.7 + noise() * 0.3) * Math.exp(-t * 55) * 0.8, 0.1);
                    }
                }
                return 1.4;
            }
            case 'rain': {
                for (let i = 0; i < 4 * sr; i++) {
                    const t = i / sr;
                    add(t, (noise() * 0.5 + noise() * 0.3) * 0.14 * Math.min(1, t * 4), 0);
                }
                for (let d = 0; d < 60; d++) {
                    const t0 = rnd() * 3.6;
                    for (let i = 0; i < 0.02 * sr; i++) { const t = i / sr; add(t0 + t, noise() * Math.exp(-t * 300) * 0.3, (rnd() - 0.5) * 1.6); }
                }
                return 4.2;
            }
            case 'thunder': {
                for (let i = 0; i < 2.8 * sr; i++) {
                    const t = i / sr;
                    const env = Math.exp(-t * 1.8) * Math.min(1, t * 60);
                    add(0.15 + t, (noise() * 0.55 + Math.sin(2 * Math.PI * (45 + rnd() * 20) * t) * 0.5) * env * 0.8, (rnd() - 0.5) * 0.4);
                }
                return 3.2;
            }
            case 'wind': {
                for (let i = 0; i < 4 * sr; i++) {
                    const t = i / sr;
                    const lfo = Math.sin(t * 1.3) * 0.5 + Math.sin(t * 0.41) * 0.5;
                    add(t, noise() * (0.35 + lfo * 0.3) * 0.2, Math.sin(t * 0.7) * 0.5);
                }
                return 4.2;
            }
            case 'fire': {
                for (let i = 0; i < 4 * sr; i++) {
                    const t = i / sr;
                    add(t, (noise() * 0.25 + noise() * 0.15) * 0.13, Math.sin(t * 0.9) * 0.3);
                }
                for (let c = 0; c < 25; c++) {
                    const t0 = rnd() * 3.8;
                    const len = 0.015 + rnd() * 0.03;
                    for (let i = 0; i < len * sr; i++) { const t = i / sr; add(t0 + t, noise() * Math.exp(-t * 160) * 0.4, (rnd() - 0.5)); }
                }
                return 4.2;
            }
            case 'waves': {
                for (let w = 0; w < 3; w++) {
                    const t0 = w * 1.4;
                    for (let i = 0; i < 1.5 * sr; i++) {
                        const t = i / sr;
                        const env = Math.sin(Math.PI * Math.min(1, t / 1.5));
                        add(t0 + t, (noise() * 0.5 + Math.sin(2 * Math.PI * 60 * t) * 0.2) * env * 0.22, (w - 1) * 0.35);
                    }
                }
                return 4.5;
            }
            case 'heartbeat': {
                for (let b = 0; b < 5; b++) {
                    const t0 = b * 0.85;
                    for (const [off, g] of [[0, 1], [0.14, 0.7]]) {
                        for (let i = 0; i < 0.1 * sr; i++) {
                            const t = i / sr;
                            add(t0 + off + t, Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 28) * 0.9 * g, 0);
                        }
                    }
                }
                return 4.5;
            }
            case 'clock': {
                for (let k = 0; k < 10; k++) {
                    const t0 = k * 0.5;
                    for (let i = 0; i < 0.025 * sr; i++) {
                        const t = i / sr;
                        const f = k % 2 === 0 ? 1100 : 850;
                        add(t0 + t, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 220) * 0.4, (k % 2 === 0 ? -0.4 : 0.4));
                    }
                }
                return 5.2;
            }
            case 'bird': case 'cricket': {
                const chirps = fxId === 'bird' ? 8 : 14;
                for (let c = 0; c < chirps; c++) {
                    const t0 = rnd() * 3.4;
                    const f = fxId === 'bird' ? (2200 + rnd() * 1800) : (4200 + rnd() * 600);
                    const len = fxId === 'bird' ? 0.08 : 0.03;
                    const reps = fxId === 'bird' ? (2 + Math.floor(rnd() * 3)) : 3;
                    for (let rp = 0; rp < reps; rp++) {
                        for (let i = 0; i < len * sr; i++) {
                            const t = i / sr;
                            const sweep = f * (1 + Math.sin(t * 60) * 0.1);
                            add(t0 + rp * (len * 2.2) + t, Math.sin(2 * Math.PI * sweep * t) * Math.exp(-t * 60) * 0.3, (rnd() - 0.5) * 1.4);
                        }
                    }
                }
                return 4;
            }
            case 'footsteps': {
                for (let s = 0; s < 7; s++) {
                    const t0 = s * 0.48;
                    const pan = s % 2 === 0 ? -0.45 : 0.45;
                    for (let i = 0; i < 0.06 * sr; i++) {
                        const t = i / sr;
                        add(t0 + t, (noise() * 0.6 + Math.sin(2 * Math.PI * 90 * t) * 0.3) * Math.exp(-t * 60) * 0.45, pan);
                    }
                }
                return 3.6;
            }
            case 'glass': {
                for (let i = 0; i < 0.03 * sr; i++) { const t = i / sr; add(0.01 + t, noise() * Math.exp(-t * 180) * 0.5, 0); }
                for (let s = 0; s < 28; s++) {
                    const t0 = 0.02 + rnd() * 0.5;
                    const f = 1800 + rnd() * 4200;
                    const len = 0.15 + rnd() * 0.35;
                    for (let i = 0; i < len * sr; i++) {
                        const t = i / sr;
                        add(t0 + t, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * (9 + rnd() * 8)) * 0.16, (rnd() - 0.5) * 1.5);
                    }
                }
                return 1.4;
            }
            case 'car': {
                for (let i = 0; i < 3.4 * sr; i++) {
                    const t = i / sr;
                    const prog = t / 3.4;                       // doppler: yaklaşırken tiz, geçerken pes
                    const f = 95 * (1 + (prog < 0.5 ? prog : 1 - prog) * 0.6);
                    const env = Math.sin(Math.PI * prog) * Math.min(1, t * 8);
                    add(t, (Math.sin(2 * Math.PI * f * t) * 0.4 + noise() * 0.18) * env * 0.5, (prog - 0.5) * 1.4);
                }
                return 3.6;
            }
            case 'horn': {
                for (let i = 0; i < 0.7 * sr; i++) {
                    const t = i / sr;
                    add(t, (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 554 * t) * 0.8) * 0.3 * Math.min(1, t * 90) * Math.exp(-Math.max(0, t - 0.55) * 20), 0);
                }
                return 0.9;
            }
            case 'notification': case 'success': case 'fail': {
                const notes = fxId === 'notification' ? [[0, 880], [0.12, 1320]]
                    : fxId === 'success' ? [[0, 523], [0.15, 659], [0.3, 784], [0.45, 1047]]
                    : [[0, 330], [0.18, 262]];
                const nlen = fxId === 'success' ? 0.35 : 0.25;
                for (const [t0, f] of notes) {
                    for (let i = 0; i < nlen * sr; i++) {
                        const t = i / sr;
                        add(t0 + t, Math.sin(2 * Math.PI * f * t) * 0.3 * Math.exp(-t * 9) * Math.min(1, t * 200), 0);
                    }
                }
                return fxId === 'success' ? 1.6 : 0.9;
            }
            case 'whoosh': {
                for (let i = 0; i < 0.8 * sr; i++) {
                    const t = i / sr;
                    const env = Math.sin(Math.PI * Math.min(1, t / 0.8));
                    add(t, noise() * env * env * 0.5, Math.sin(t / 0.8 * Math.PI) * 1.2 - 0.6);
                }
                return 1;
            }
            case 'explosion': {
                for (let i = 0; i < 2.2 * sr; i++) {
                    const t = i / sr;
                    const env = Math.exp(-t * 2.4) * Math.min(1, t * 80);
                    add(t, (noise() * 0.8 + Math.sin(2 * Math.PI * (38 + rnd() * 14) * t) * 0.5) * env * 0.85, (rnd() - 0.5) * 0.2);
                }
                return 2.4;
            }
            case 'laser': {
                for (let z = 0; z < 3; z++) {
                    const t0 = z * 0.3;
                    for (let i = 0; i < 0.22 * sr; i++) {
                        const t = i / sr;
                        const f = 2200 * Math.exp(-t * 12) + 180;
                        add(t0 + t, Math.sin(2 * Math.PI * f * t) * 0.3 * Math.min(1, t * 200) * Math.exp(-t * 5), 0);
                    }
                }
                return 1.2;
            }
            case 'typing': {
                for (let k = 0; k < 22; k++) {
                    const t0 = rnd() * 2.6;
                    for (let i = 0; i < 0.018 * sr; i++) {
                        const t = i / sr;
                        add(t0 + t, (noise() * 0.5 + Math.sin(2 * Math.PI * (900 + rnd() * 700) * t) * 0.4) * Math.exp(-t * 240) * 0.3, (rnd() - 0.5) * 0.8);
                    }
                }
                return 3;
            }
            case 'page': {
                for (let i = 0; i < 0.5 * sr; i++) {
                    const t = i / sr;
                    const env = Math.sin(Math.PI * Math.min(1, t / 0.5)) * Math.min(1, t * 40);
                    add(t, noise() * env * 0.3, Math.sin(t / 0.5 * Math.PI) - 0.5);
                }
                return 0.8;
            }
            case 'water': {
                for (let d = 0; d < 12; d++) {
                    const t0 = rnd() * 2.8;
                    const f0 = 700 + rnd() * 900;
                    for (let i = 0; i < 0.14 * sr; i++) {
                        const t = i / sr;
                        const f = f0 * (1 + Math.exp(-t * 30) * 0.8);
                        add(t0 + t, Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 24) * 0.3, (rnd() - 0.5) * 1.2);
                    }
                }
                return 3.2;
            }
            case 'applause': {
                for (let c = 0; c < 130; c++) {
                    const t0 = rnd() * 3.4;
                    for (let i = 0; i < 0.025 * sr; i++) {
                        const t = i / sr;
                        add(t0 + t, noise() * Math.exp(-t * 220) * 0.35, (rnd() - 0.5) * 1.7);
                    }
                }
                return 3.8;
            }
            case 'laugh': {
                for (let h = 0; h < 6; h++) {
                    const t0 = h * 0.24;
                    const f = 240 + Math.sin(h * 1.7) * 40;
                    for (let i = 0; i < 0.13 * sr; i++) {
                        const t = i / sr;
                        add(t0 + t, (Math.sin(2 * Math.PI * f * t) + noise() * 0.25) * Math.sin(Math.PI * t / 0.13) * 0.4, 0.1);
                    }
                }
                return 1.8;
            }
            case 'crowd': {
                for (let i = 0; i < 3 * sr; i++) {
                    const t = i / sr;
                    add(t, (noise() * 0.4 + Math.sin(2 * Math.PI * 120 * t) * 0.1) * 0.12 * Math.min(1, t * 3), Math.sin(t * 0.8) * 0.4);
                }
                for (let c = 0; c < 45; c++) {
                    const t0 = rnd() * 2.6;
                    for (let i = 0; i < 0.02 * sr; i++) { const t = i / sr; add(t0 + t, noise() * Math.exp(-t * 300) * 0.25, (rnd() - 0.5) * 1.8); }
                }
                return 3.3;
            }
            default: {
                for (let i = 0; i < 0.4 * sr; i++) {
                    const t = i / sr;
                    add(t, Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 10) * 0.3, 0);
                }
                return 0.5;
            }
        }
    }

    /**
     * Ses efekti üret: prompt'tan şablon eşle, cihazda sentezle, WAV objURL döndür.
     * Şablon eşleşmezse null döner → arayan taraf müzik yoluna düşer.
     */
    function generateSfxUrl(prompt) {
        const fx = matchFx(prompt);
        if (!fx) return null;
        const sr = 22050;
        const seed = hashString(String(prompt || fx.id));
        // 1) kuru çalıştırma → toplam süreyi öğren
        const drySec = synthesizeFx(fx.id, mulberry32(seed), function () {}, sr);
        const total = Math.max(1, Math.ceil(drySec * sr));
        const L = new Float32Array(total);
        const R = new Float32Array(total);
        const add = function (tSec, val, pan) {
            const i = Math.floor(tSec * sr);
            if (i < 0 || i >= total) return;
            const p = pan || 0;
            L[i] += val * (1 - Math.max(0, p)) * 0.5;
            R[i] += val * (1 + Math.min(0, p)) * 0.5;
        };
        // 2) gerçek üretim (aynı tohum → aynı ses)
        synthesizeFx(fx.id, mulberry32(seed), add, sr);
        // 3) yumuşak bitir + kırp
        const fade = Math.min(Math.floor(0.06 * sr), Math.floor(total / 4));
        for (let i = 0; i < fade; i++) {
            const g = i / fade;
            L[total - 1 - i] *= g; R[total - 1 - i] *= g;
        }
        for (let i = 0; i < total; i++) {
            L[i] = Math.max(-1, Math.min(1, L[i]));
            R[i] = Math.max(-1, Math.min(1, R[i]));
        }
        return { url: encodeWav(L, R, sr), label: fx.label, emoji: fx.emoji, id: fx.id };
    }

    // ========================================================
    // Genel API
    // ========================================================

    window.NesilMedia = {
        AUDIO_MODELS,
        VIDEO_MODELS,
        generateSpeech,
        generateMusic,
        generateVideo,
        FX_LIBRARY,
        matchFx,
        generateSfxUrl
    };

})();
