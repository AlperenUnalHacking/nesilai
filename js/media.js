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
        { id: 'auto',                        label: 'Otomatik',        note: 'İlk çalışan hızlı model' },
        { id: 'bytedance/seedance-2.0-mini', label: 'Seedance 2.0 Mini', note: 'Hızlı video' },
        { id: 'bytedance/seedance-2.0-fast', label: 'Seedance 2.0 Fast', note: 'Dengeli' },
        { id: 'alibaba/wan-2.2-fast',        label: 'Wan 2.2 Fast',      note: 'Alibaba hızlı' },
        { id: 'alibaba/wan-2.7',             label: 'Wan 2.7',           note: 'Yüksek kalite' },
        { id: 'x-ai/grok-imagine-video',     label: 'Grok Imagine',      note: 'xAI video' },
        { id: 'amazon/nova-reel-v1',         label: 'Nova Reel',         note: 'Amazon video' }
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
        return fetchBinary('/video/' + encodeURIComponent(prompt) + '?model=' + encodeURIComponent(model), signal);
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

    // ========================================================
    // Genel API
    // ========================================================

    /**
     * Müzik/ses üretimi: model 'auto' ise önce bulut (anahtarsız →
     * anahtarlı), tıkanırsa cihazda sentez. Somut model verilirse
     * yalnız bulut denenir.
     */
    async function generateMusic(prompt, model, signal) {
        if (model && model !== 'auto') return cloudText(prompt, model, signal);
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
    async function generateSpeech(text, model, signal) {
        if (model && model !== 'auto') return cloudText(text, model, signal);
        try {
            return await cloudText(text, 'hexgrad/kokoro-82m', signal);
        } catch (e1) {
            try {
                return await cloudText(text, 'x-ai/grok-tts', signal);
            } catch (e2) {
                throw new Error('Bulut ses modelleri şu an tıkalı. Cihaz seslendirme için mesajın altındaki "Dinle" butonunu kullanabilirsin; bulut için ücretsiz anahtar: enter.pollinations.ai/keys');
            }
        }
    }

    /**
     * Video: bulut zorunlu. 'auto' → hızlı modeller sırayla denenir.
     */
    async function generateVideo(prompt, model, signal) {
        if (model && model !== 'auto') return cloudVideo(prompt, model, signal);
        const chain = ['bytedance/seedance-2.0-mini', 'bytedance/seedance-2.0-fast', 'alibaba/wan-2.2-fast', 'x-ai/grok-imagine-video'];
        let lastErr;
        for (const m of chain) {
            try { return await cloudVideo(prompt, m, signal); }
            catch (e) { lastErr = e; }
        }
        throw lastErr || new Error('Video modelleri şu an kullanılamıyor.');
    }

    window.NesilMedia = {
        AUDIO_MODELS,
        VIDEO_MODELS,
        generateSpeech,
        generateMusic,
        generateVideo
    };

})();
