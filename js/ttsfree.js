/* ========================================================
   NesilAI — Ücretsiz Bulut TTS (anahtarsız)
   --------------------------------------------------------
   Yerel/model tabanlı seslendirme YOK. Sadece bedava ve
   anahtarsız seslendirme API'ları kullanılır:

     1) Google Çeviri TTS — translate.google.com/translate_tts
        (anahtar yok, sınır yok; <audio> ile CORS'a takılmaz)
     2) Microsoft Edge Neural TTS — speech.platform.bing.com
        (Edge'in Okudu Anahtarı ucu; WebSocket, CORS yok;
         Emel/Ahmet gibi doğal Neural sesler; Sec-MS-GEC
         token'ı tarayıcıda BigInt+SHA-256 ile üretilir)

   Parça parça çalınır; bir parça/motor başarısız olursa
   sıradaki motor devreye girer. Hepsi başarısız olursa
   tts.js Web Speech'e düşer (yalnızca son yedek).
   Hem PC hem telefon (Capacitor WebView) üzerinde çalışır.
   ======================================================== */
(function () {
    'use strict';

    var currentAudio = null;
    var speakingState = false;
    var aborted = false;

    function isSupported() {
        return typeof Audio !== 'undefined';
    }

    // Metni sesten arındır (tts.js ile aynı kurallar)
    function clean(text) {
        return String(text || '')
            .replace(/```[\s\S]*?```/g, ' [kod bloğu] ')
            .replace(/`([^`]+)`/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
            .replace(/_{1,3}(.*?)_{1,3}/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\(([^)\n]{1,200})\)\s*\[(https?:\/\/[^\]\s]+)\]/gi, '$1')
            .replace(/^[\*\-\+]\s+/gm, '')
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Cümle sınırlarından böl
    function splitChunks(text, max) {
        var chunks = [], rest = String(text || '');
        while (rest.length > 0) {
            if (rest.length <= max) { chunks.push(rest); break; }
            var cut = -1;
            for (var i = max; i >= max - 60 && i > 10; i--) {
                if (/[.!?:]\s/.test(rest.slice(i - 1, i + 1))) { cut = i; break; }
            }
            if (cut === -1) {
                cut = rest.lastIndexOf(' ', max);
                if (cut <= 10) cut = max;
            }
            chunks.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
        }
        return chunks.filter(Boolean);
    }

    function escUrl(s) { return encodeURIComponent(s); }
    function escSsml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    // ========================================================
    // Motor 1: Google Çeviri TTS — anahtarsız, sınırsız
    // ========================================================
    function googleUrls(text, lang, speed) {
        var sp = (typeof speed === 'number' && speed >= 0.5 && speed <= 1.5) ? speed : 1;
        return splitChunks(text, 190).map(function (chunk) {
            return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob' +
                '&ttsspeed=' + sp +
                '&tl=' + escUrl(lang) +
                '&q=' + escUrl(chunk);
        });
    }

    // ========================================================
    // Motor 2: Edge Neural TTS (WebSocket, anahtarsız)
    // ========================================================
    var EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
    var EDGE_GEC_VERSION = '1-130.0.2849.68';
    var EDGE_WSS = [
        'wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1',
        'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
    ];

    function sha256HexUpper(str) {
        if (!(window.crypto && crypto.subtle && typeof BigInt !== 'undefined')) {
            return Promise.reject(new Error('crypto yok'));
        }
        var data = new TextEncoder().encode(str);
        return crypto.subtle.digest('SHA-256', data).then(function (buf) {
            var arr = new Uint8Array(buf), hex = '';
            for (var i = 0; i < arr.length; i++) hex += ('0' + arr[i].toString(16)).slice(-2);
            return hex.toUpperCase();
        });
    }

    // edge-tts algoritması: 5 dakikalık pencere + Windows epoch + SHA-256
    function edgeSecMsGec() {
        var sec = Math.floor(Date.now() / 1000) + 11644473600;
        sec -= sec % 300;
        var ticks = (BigInt(sec) * BigInt(10000000)).toString();
        return sha256HexUpper(ticks + EDGE_TOKEN);
    }

    function ratePct(speed) {
        var s = (typeof speed === 'number' && speed >= 0.5 && speed <= 2) ? speed : 1;
        var p = Math.round((s - 1) * 100);
        return (p >= 0 ? '+' : '') + p + '%';
    }

    /** Tek parçayı Edge WSS ile sentezler → Promise<Blob> (startIdx: yedek ana makine için) */
    function edgeSynthesize(text, voice, speed, startIdx) {
        var idx = startIdx || 0;
        return edgeSecMsGec().then(function (gec) {
            return new Promise(function (resolve, reject) {
                var done = false, failed = false;
                var parts = [];
                var ws = null;

                function failOnce(msg) {
                    if (done || failed) return;
                    failed = true;
                    try { ws && ws.close(); } catch (e) { /* yoksay */ }
                    // Sıradaki WSS ana makinesini dene (sonsuz döngü yok: idx dışarıdan gelir)
                    if (idx < EDGE_WSS.length - 1) {
                        setTimeout(function () {
                            edgeSynthesize(text, voice, speed, idx + 1).then(resolve, reject);
                        }, 120);
                        return;
                    }
                    reject(new Error(msg || 'Edge TTS başarısız'));
                }

                function tryConnect() {
                    var url = EDGE_WSS[idx] +
                        '?TrustedClientToken=' + EDGE_TOKEN +
                        '&Sec-MS-GEC=' + gec +
                        '&Sec-MS-GEC-Version=' + EDGE_GEC_VERSION;
                    var guard = setTimeout(function () { failOnce('Edge TTS zaman aşımı'); }, 15000);

                    try { ws = new WebSocket(url); } catch (e) {
                        clearTimeout(guard);
                        failOnce('WebSocket açılamadı');
                        return;
                    }
                    ws.binaryType = 'arraybuffer';

                    ws.onopen = function () {
                        var ts = new Date().toString();
                        // 1) speech.config
                        ws.send('X-Timestamp:' + ts + '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
                            '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}');
                        // 2) ssml isteği
                        var reqId = '';
                        for (var i = 0; i < 32; i++) reqId += Math.floor(Math.random() * 16).toString(16);
                        var ssml =
                            "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" +
                            escSsml(voice.split('-').slice(0, 2).join('-')) + "'>" +
                            "<voice name='" + escSsml(voice) + "'>" +
                            "<prosody rate='" + ratePct(speed) + "' pitch='+0Hz' volume='+0%'>" +
                            escSsml(text) +
                            '</prosody></voice></speak>';
                        ws.send('X-RequestId:' + reqId + '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' + ts + '\r\nPath:ssml\r\n\r\n' + ssml);
                    };

                    ws.onmessage = function (ev) {
                        if (typeof ev.data === 'string') {
                            if (ev.data.indexOf('Path:turn.end') !== -1) {
                                done = true;
                                clearTimeout(guard);
                                try { ws.close(); } catch (e) { /* yoksay */ }
                                if (!parts.length) { reject(new Error('Edge TTS boş yanıt')); return; }
                                resolve(new Blob(parts, { type: 'audio/mpeg' }));
                            }
                            return;
                        }
                        // binary: [2B başlık uzunluğu][başlık][audio]
                        var buf = new Uint8Array(ev.data);
                        if (buf.byteLength < 2) return;
                        var headLen = (buf[0] << 8) | buf[1];
                        if (buf.byteLength > headLen + 2) {
                            parts.push(ev.data.slice(headLen + 2));
                        }
                    };

                    ws.onerror = function () { clearTimeout(guard); failOnce('Edge TTS bağlantı hatası'); };
                    ws.onclose = function () {
                        clearTimeout(guard);
                        failOnce('Edge TTS bağlantı kapandı');
                    };
                }
                tryConnect();
            });
        });
    }

    // Edge Neural ses kataloğu (bedava, anahtarsız)
    var EDGE_VOICES = [
        { id: 'tr-TR-EmelNeural',     label: 'Emel — Türkçe kadın (Neural)' },
        { id: 'tr-TR-AhmetNeural',    label: 'Ahmet — Türkçe erkek (Neural)' },
        { id: 'en-US-AriaNeural',     label: 'Aria — English US kadın (Neural)' },
        { id: 'en-US-GuyNeural',      label: 'Guy — English US erkek (Neural)' },
        { id: 'en-US-JennyNeural',    label: 'Jenny — English US kadın (Neural)' },
        { id: 'en-GB-SoniaNeural',    label: 'Sonia — English UK kadın (Neural)' },
        { id: 'en-GB-RyanNeural',     label: 'Ryan — English UK erkek (Neural)' },
        { id: 'ru-RU-SvetlanaNeural', label: 'Svetlana — Русский kadın (Neural)' },
        { id: 'ru-RU-DmitryNeural',   label: 'Dmitry — Русский erkek (Neural)' },
        { id: 'de-DE-KatjaNeural',    label: 'Katja — Deutsch kadın (Neural)' },
        { id: 'fr-FR-DeniseNeural',   label: 'Denise — Français kadın (Neural)' },
        { id: 'es-ES-ElviraNeural',   label: 'Elvira — Español kadın (Neural)' },
        { id: 'hi-IN-SwaraNeural',    label: 'Swara — हिन्दी kadın (Neural)' },
        { id: 'pt-BR-FranciscaNeural', label: 'Francisca — Português kadın (Neural)' }
    ];

    var ENGINES = {
        auto:   { id: 'auto',   label: 'Otomatik (Google → Edge Neural)' },
        google: { id: 'google', label: 'Google Çeviri TTS — ücretsiz, sınırsız' },
        edge:   { id: 'edge',   label: 'Edge Neural (Microsoft) — ücretsiz, doğal sesler' }
    };

    function getPref(key, dflt) {
        try { return localStorage.getItem(key) || dflt; } catch (e) { return dflt; }
    }
    function setPref(key, val) {
        try { localStorage.setItem(key, val); } catch (e) { /* yoksay */ }
    }

    function stop() {
        aborted = true;
        if (currentAudio) {
            try { currentAudio.pause(); } catch (e) { /* yoksay */ }
            try { currentAudio.removeAttribute('src'); } catch (e) { /* yoksay */ }
            currentAudio = null;
        }
        speakingState = false;
    }

    function isSpeaking() { return speakingState; }

    function setVolume(v) {
        var n = parseFloat(v);
        if (!isNaN(n)) setPref('nesilai_ttsfree_vol', String(Math.max(0, Math.min(1, n))));
        return getVolume();
    }
    function getVolume() {
        var v = parseFloat(getPref('nesilai_ttsfree_vol', '1'));
        return isNaN(v) ? 1 : Math.max(0, Math.min(1, v));
    }

    /**
     * speak(rawText, onStart, onEnd, onError, opts)
     * opts: { lang:'tr', engine:'auto|google|edge', voice:'tr-TR-EmelNeural', speed:1 }
     */
    function speak(rawText, onStart, onEnd, onError, opts) {
        stop();
        aborted = false;
        var o = opts || {};
        var text = clean(rawText);
        if (!text) { if (onEnd) onEnd(); return; }

        var lang = o.lang || 'tr';
        var engine = o.engine || getPref('nesilai_ttsfree_pref', 'auto');
        var voice = o.voice || getPref('nesilai_ttsfree_voice', 'tr-TR-EmelNeural');
        var speed = o.speed || parseFloat(getPref('nesilai_voice_speed', '1')) || 1;

        // Parça planı: her parça için denenecek motor sırası
        var chunks = splitChunks(text, 240);
        var plan = chunks.map(function (c) {
            var tries = [];
            if (engine === 'auto' || engine === 'google') tries.push({ kind: 'google', chunk: c });
            if (engine === 'auto' || engine === 'edge') tries.push({ kind: 'edge', chunk: c });
            return tries.length ? tries : null;
        }).filter(Boolean);
        if (!plan.length) { if (onError) onError(new Error('Ses motoru yok.')); return; }

        speakingState = true;
        if (onStart) onStart();

        var vol = getVolume();
        var gi = 0;

        function playUrl(url, onDone, onFail) {
            var a = new Audio();
            var settled = false;   // onerror + play() reddi çift atlama yapmasın
            a.volume = vol;
            a.preload = 'auto';
            currentAudio = a;
            a.onerror = function () {
                if (settled) return;
                settled = true;
                onFail();
            };
            a.onended = function () {
                if (settled) return;
                settled = true;
                onDone();
            };
            a.src = url;
            var p = a.play();
            if (p && typeof p.catch === 'function') {
                p.catch(function () {
                    if (settled) return;
                    settled = true;
                    onFail();
                });
            }
        }

        function playGroup() {
            if (aborted) return;
            if (gi >= plan.length) {
                speakingState = false;
                currentAudio = null;
                if (onEnd) onEnd();
                return;
            }
            var tries = plan[gi++].slice();
            function tryNext() {
                if (aborted) return;
                if (!tries.length) {
                    // Bu parçayı hiçbir motor okuyamadı → hatayı bildir ve bırak
                    speakingState = false;
                    currentAudio = null;
                    if (onError) onError(new Error('Tüm ses motorları başarısız.'));
                    return;
                }
                var t = tries.shift();
                if (t.kind === 'google') {
                    playUrl(
                        'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&ttsspeed=' +
                        ((speed >= 0.5 && speed <= 1.5) ? speed : 1) +
                        '&tl=' + escUrl(lang) + '&q=' + escUrl(t.chunk),
                        playGroup,   // parça bitti → sıradaki grup
                        tryNext      // başarısız → aynı parça için sıradaki motor
                    );
                } else {
                    edgeSynthesize(t.chunk, voice, speed).then(function (blob) {
                        var url = URL.createObjectURL(blob);
                        playUrl(url, function () {
                            try { URL.revokeObjectURL(url); } catch (e) { /* yoksay */ }
                            playGroup();
                        }, function () {
                            try { URL.revokeObjectURL(url); } catch (e) { /* yoksay */ }
                            tryNext();
                        });
                    }, tryNext);
                }
            }
            tryNext();
        }
        playGroup();
    }

    window.NesilTTSFree = {
        isSupported: isSupported,
        speak: speak,
        stop: stop,
        isSpeaking: isSpeaking,
        setVolume: setVolume,
        getVolume: getVolume,
        clean: clean,
        ENGINES: ENGINES,
        VOICES: EDGE_VOICES
    };

})();
