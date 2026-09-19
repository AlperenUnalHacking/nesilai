/* ========================================================
   NesilAI — Text to Speech (TTS) Motoru
   Web Speech API (SpeechSynthesis) Entegrasyonu
   ======================================================== */
(function () {
    'use strict';

    let currentUtterance = null;
    let isSpeakingState = false;
    let selectedVoice = null;
    let speechRate = 1.0;
    let speechPitch = 1.0;
    let onCurrentEndCallback = null;

    function isSupported() {
        return 'speechSynthesis' in window;
    }

    // Markdown ve kod bloklarını sesten arındırma
    function cleanTextForSpeech(text) {
        if (!text) return '';
        return text
            // Kod bloklarını kaldır veya kısalt
            .replace(/```[\s\S]*?```/g, ' [kod bloğu] ')
            // Satır içi kodları temizle
            .replace(/`([^`]+)`/g, '$1')
            // Başlık işaretlerini (#) kaldır
            .replace(/^#{1,6}\s+/gm, '')
            // Kalın ve italik işaretlerini kaldır
            .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
            .replace(/_{1,3}(.*?)_{1,3}/g, '$1')
            // Bağlantıları kaldır
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // NesilAI link kuralı: (Başlık) [URL] → yalnızca başlık okunur, ham URL okunmaz
            .replace(/\(([^)\n]{1,200})\)\s*\[(https?:\/\/[^\]\s]+)\]/gi, '$1')
            // Madde işaretlerini sadeleştir
            .replace(/^[\*\-\+]\s+/gm, '')
            // Emojileri temizle (opsiyonel)
            .replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu, '')
            .trim();
    }

    function getVoices() {
        if (!isSupported()) return [];
        return window.speechSynthesis.getVoices();
    }

    // Türkçe ses bul: kaydedilmiş seçim yoksa en uygun TR sesini döndür
    function findTurkishVoice() {
        const voices = getVoices();
        if (!voices.length) return null;
        // Önce tam tr-TR, sonra tr ile başlayan herhangi bir ses, sonra yerel TR
        return voices.find(v => v.lang.toLowerCase() === 'tr-tr') ||
               voices.find(v => v.lang.toLowerCase().startsWith('tr') && v.localService) ||
               voices.find(v => v.lang.toLowerCase().startsWith('tr')) ||
               null;
    }

    // Ses listesi geç gelmiş olabilir: ses yüklenene kadar kısa aralıklarla dene
    function waitForVoices(maxWaitMs) {
        return new Promise((resolve) => {
            const start = Date.now();
            const poll = () => {
                if (getVoices().length > 0) return resolve(true);
                if (Date.now() - start >= (maxWaitMs || 3000)) return resolve(false);
                setTimeout(poll, 150);
            };
            poll();
        });
    }

    function initVoiceSettings(voiceSelectEl, speedEl, pitchEl) {
        if (!isSupported()) return;

        function populateVoices() {
            const voices = getVoices();
            if (!voiceSelectEl) return;
            voiceSelectEl.innerHTML = '';

            if (voices.length === 0) {
                const opt = document.createElement('option');
                opt.textContent = 'Varsayılan Sistem Sesi';
                voiceSelectEl.appendChild(opt);
                return;
            }

            // Türkçe sesler en önde; ardından yerel sistem sesleri, sonra diğerleri
            const sorted = [...voices].sort((a, b) => {
                const aTr = a.lang.toLowerCase().startsWith('tr');
                const bTr = b.lang.toLowerCase().startsWith('tr');
                if (aTr && !bTr) return -1;
                if (!aTr && bTr) return 1;
                if (a.localService !== b.localService) return a.localService ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            const savedVoiceName = localStorage.getItem('nesilai_voice_name');

            sorted.forEach(voice => {
                const opt = document.createElement('option');
                opt.value = voice.name;
                const isTr = voice.lang.toLowerCase().startsWith('tr');
                const isLocal = voice.localService ? ' [yerel]' : ' [çevrimiçi]';
                opt.textContent = `${isTr ? '🇹🇷 ' : ''}${voice.name} (${voice.lang})${isLocal}`;
                if (savedVoiceName === voice.name || (!savedVoiceName && isTr && !selectedVoice)) {
                    opt.selected = true;
                    selectedVoice = voice;
                }
                voiceSelectEl.appendChild(opt);
            });

            // Kullanılabilir ses sayısını ayarlarda göster
            const countNote = document.getElementById('voice-count-note');
            if (countNote) {
                const trCount = sorted.filter(v => v.lang.toLowerCase().startsWith('tr')).length;
                countNote.textContent = `${sorted.length} ses kullanılabilir (${trCount} Türkçe) — tüm diller listelenir; tarayıcının desteklediği sesler cihazına göre değişir.`;
            }
        }

        populateVoices();
        // Sesler tarayıcıya göre geç gelir; her yeni ses listesinde tazele
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = populateVoices;
        }
        window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener('voiceschanged', populateVoices);

        if (voiceSelectEl) {
            voiceSelectEl.addEventListener('change', () => {
                const voices = getVoices();
                selectedVoice = voices.find(v => v.name === voiceSelectEl.value);
                if (selectedVoice) {
                    localStorage.setItem('nesilai_voice_name', selectedVoice.name);
                }
            });
        }

        if (speedEl) {
            const savedSpeed = localStorage.getItem('nesilai_voice_speed');
            if (savedSpeed) speedEl.value = savedSpeed;
            speechRate = parseFloat(speedEl.value) || 1.0;

            speedEl.addEventListener('input', () => {
                speechRate = parseFloat(speedEl.value) || 1.0;
                localStorage.setItem('nesilai_voice_speed', speechRate);
                const valDisplay = document.getElementById('voice-speed-val');
                if (valDisplay) valDisplay.textContent = speechRate.toFixed(1);
            });
        }

        if (pitchEl) {
            const savedPitch = localStorage.getItem('nesilai_voice_pitch');
            if (savedPitch) pitchEl.value = savedPitch;
            speechPitch = parseFloat(pitchEl.value) || 1.0;

            pitchEl.addEventListener('input', () => {
                speechPitch = parseFloat(pitchEl.value) || 1.0;
                localStorage.setItem('nesilai_voice_pitch', speechPitch);
                const valDisplay = document.getElementById('voice-pitch-val');
                if (valDisplay) valDisplay.textContent = speechPitch.toFixed(1);
            });
        }
    }

    async function speak(rawText, onStart, onEnd, onError) {
        if (!isSupported()) {
            if (onError) onError(new Error('TTS desteklenmiyor.'));
            return;
        }

        stop();

        const cleanText = cleanTextForSpeech(rawText);
        if (!cleanText) {
            if (onEnd) onEnd();
            return;
        }

        // Sesler tarayıcıda geç yükleniyorsa kısaca bekle (ilk konuşmada kritik)
        if (!selectedVoice && getVoices().length === 0) {
            await waitForVoices(3000);
        }

        // Kaydedilmiş seçim yoksa Türkçe sesi zorunlu kıl — İngilizce sesin
        // Türkçe metni bozuk okumasını engeller
        if (!selectedVoice) {
            selectedVoice = findTurkishVoice();
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);

        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
        } else {
            // Ses yoksa bile dili Türkçe işaretle — tarayıcı genelde uygun sesi seçer
            utterance.lang = 'tr-TR';
        }

        utterance.rate = speechRate;
        utterance.pitch = speechPitch;

        onCurrentEndCallback = onEnd;

        utterance.onstart = () => {
            isSpeakingState = true;
            if (onStart) onStart();
        };

        utterance.onend = () => {
            isSpeakingState = false;
            currentUtterance = null;
            if (onEnd) onEnd();
        };

        utterance.onerror = (e) => {
            isSpeakingState = false;
            currentUtterance = null;
            if (e.error !== 'interrupted' && e.error !== 'canceled') {
                if (onError) onError(e);
            } else {
                if (onEnd) onEnd();
            }
        };

        currentUtterance = utterance;

        // Chrome bug: uzun metinler ~15 sn'de kesilir; güvenli parça boyutu 200 karakter
        const MAX_CHUNK = 200;
        if (cleanText.length <= MAX_CHUNK) {
            window.speechSynthesis.speak(utterance);
            return;
        }

        // Metni cümle sınırlarından böl, sırayla seslendir
        const chunks = [];
        let rest = cleanText;
        while (rest.length > 0) {
            if (rest.length <= MAX_CHUNK) {
                chunks.push(rest);
                break;
            }
            let cut = -1;
            // Parça sınırına yakın cümle sonu (. ! ? :) ara
            for (let i = MAX_CHUNK; i >= MAX_CHUNK - 60 && i > 10; i--) {
                if (/[.!?:]\s/.test(rest.slice(i - 1, i + 1))) { cut = i; break; }
            }
            if (cut === -1) {
                // Cümle sonu yoksa boşluktan böl
                cut = rest.lastIndexOf(' ', MAX_CHUNK);
                if (cut <= 10) cut = MAX_CHUNK;
            }
            chunks.push(rest.slice(0, cut).trim());
            rest = rest.slice(cut).trim();
        }

        chunks.forEach((chunk, idx) => {
            const part = new SpeechSynthesisUtterance(chunk);
            if (selectedVoice) { part.voice = selectedVoice; part.lang = selectedVoice.lang; }
            else { part.lang = 'tr-TR'; }
            part.rate = speechRate;
            part.pitch = speechPitch;
            if (idx === 0) {
                part.onstart = utterance.onstart;
                part.onend = utterance.onend;
                part.onerror = utterance.onerror;
            } else {
                // Son parça değilse: sonraki parça konuşulmaya devam etsin
                part.onend = () => { /* devam ediyor */ };
                part.onerror = () => { /* yoksay */ };
            }
            // Sıraya al — tarayıcı parçaları sırayla okur
            window.speechSynthesis.speak(part);
        });
    }

    function stop() {
        if (!isSupported()) return;
        window.speechSynthesis.cancel();
        isSpeakingState = false;
        currentUtterance = null;
        if (onCurrentEndCallback) {
            const cb = onCurrentEndCallback;
            onCurrentEndCallback = null;
            cb();
        }
    }

    function isSpeaking() {
        return isSpeakingState || (isSupported() && window.speechSynthesis.speaking);
    }

    window.NesilTTS = {
        isSupported,
        initVoiceSettings,
        cleanTextForSpeech,
        speak,
        stop,
        isSpeaking,
        findTurkishVoice
    };

})();
