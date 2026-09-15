/* ========================================================
   NesilAI — Photo to Text (OCR / Vision) Motoru
   Tesseract.js Entegrasyonu
   ======================================================== */
(function () {
    'use strict';

    function isSupported() {
        return typeof Tesseract !== 'undefined';
    }

    async function extractText(imageSource, onProgress = null) {
        if (!isSupported()) {
            throw new Error('Tesseract kütüphanesi yüklenemedi.');
        }

        try {
            const result = await Tesseract.recognize(
                imageSource,
                'tur+eng',
                {
                    logger: (m) => {
                        if (onProgress && m.status === 'recognizing text') {
                            const percent = Math.round((m.progress || 0) * 100);
                            onProgress(percent, m.status);
                        }
                    }
                }
            );

            return (result.data && result.data.text) ? result.data.text.trim() : '';
        } catch (error) {
            console.error('OCR Hatası:', error);
            throw error;
        }
    }

    window.NesilP2T = {
        isSupported,
        extractText
    };

})();
