/* ========================================================
   NesilAI — Speech to Text (STT) Motoru
   Web Speech API (SpeechRecognition) Entegrasyonu
   ======================================================== */
(function () {
    'use strict';

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    let recognition = null;
    let isListeningState = false;
    let shouldKeepListening = false;
    let currentCallbacks = {};

    function isSupported() {
        return !!SpeechRecognition;
    }

    function start(callbacks = {}) {
        if (!isSupported()) {
            if (callbacks.onError) {
                callbacks.onError(new Error('Tarayıcınız konuşma tanıma özelliğini desteklemiyor.'));
            }
            return false;
        }

        stop();

        currentCallbacks = callbacks;
        shouldKeepListening = callbacks.continuous !== false;

        try {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
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
                if (event.error === 'no-speech') return;
                console.warn('STT uyarısı:', event.error);
                if (currentCallbacks.onError) currentCallbacks.onError(event);
            };

            recognition.onend = () => {
                if (shouldKeepListening && isListeningState) {
                    try {
                        recognition.start();
                    } catch (e) {
                        isListeningState = false;
                        if (currentCallbacks.onEnd) currentCallbacks.onEnd();
                    }
                } else {
                    isListeningState = false;
                    if (currentCallbacks.onEnd) currentCallbacks.onEnd();
                }
            };

            recognition.start();
            return true;
        } catch (error) {
            console.error('STT Başlatma Hatası:', error);
            if (callbacks.onError) callbacks.onError(error);
            return false;
        }
    }

    function stop() {
        shouldKeepListening = false;
        isListeningState = false;
        if (recognition) {
            try {
                recognition.stop();
            } catch (e) {}
            recognition = null;
        }
    }

    function isListening() {
        return isListeningState;
    }

    window.NesilSTT = {
        isSupported,
        start,
        stop,
        isListening
    };

})();
