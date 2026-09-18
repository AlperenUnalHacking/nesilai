/* ========================================================
   NesilAI — Arayüz Ses Efektleri (sfx.js)
   --------------------------------------------------------
   WebAudio ile cihazda üretilen kısa bildirim sesleri;
   hiçbir dosya indirilmez, hiçbir ağ isteği yapılmaz.
   Sesler:
   - reply   : iMessage tarzı üç notalı "tri-tone" (AI yanıtı)
   - sent    : mesaj gönderildi (kısa pop)
   - success : işlem tamamlandı (çift nota yükseliş)
   - error   : işlem başarısız (düşük çift nota)
   Ayarlar → Ses bölümündeki anahtar ile kapatılabilir;
   varsayılan açık. İlk kullanıcı etkileşimine kadar sessizdir
   (tarayıcı otomatik oynatma politikası).
   ======================================================== */
(function () {
    'use strict';

    const TOGGLE_KEY = 'nesilai_sfx_enabled';

    let ctx = null;

    function enabled() {
        return localStorage.getItem(TOGGLE_KEY) !== 'false';
    }

    function setEnabled(v) {
        localStorage.setItem(TOGGLE_KEY, v ? 'true' : 'false');
    }

    // AudioContext'i tembel oluştur: kullanıcı jestinden sonra güvenli
    function getCtx() {
        if (!enabled()) return null;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            if (!ctx) ctx = new AC();
            if (ctx.state === 'suspended') ctx.resume().catch(() => { });
            return ctx;
        } catch (e) { return null; }
    }

    /** Tek nota: osilatör + zarf */
    function tone(ac, freq, startAt, dur, peak, type) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, startAt);

        // Yumuşak saldırı/serbest bırakma zarfı — sert "bip" değil
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

        osc.connect(gain).connect(ac.destination);
        osc.start(startAt);
        osc.stop(startAt + dur + 0.02);
    }

    /**
     * iMessage tarzı gelen-mesaj sesi (tri-tone esinli):
     * üç hızlı nota — G5 → E5 → C6, hafif arp tınısı
     */
    function playReply() {
        const ac = getCtx();
        if (!ac) return;
        const t = ac.currentTime + 0.01;
        tone(ac, 783.99, t, 0.16, 0.16, 'sine');        // G5
        tone(ac, 659.25, t + 0.09, 0.16, 0.14, 'sine'); // E5
        tone(ac, 1046.50, t + 0.18, 0.30, 0.12, 'sine');// C6 (uzun süreç)
    }

    /** Mesaj gönderme: kısa, tok tek nota */
    function playSent() {
        const ac = getCtx();
        if (!ac) return;
        const t = ac.currentTime + 0.01;
        tone(ac, 660, t, 0.09, 0.12, 'sine');
        tone(ac, 990, t + 0.05, 0.08, 0.07, 'sine');
    }

    /** Başarı: yükselen çift nota */
    function playSuccess() {
        const ac = getCtx();
        if (!ac) return;
        const t = ac.currentTime + 0.01;
        tone(ac, 523.25, t, 0.12, 0.12, 'sine');        // C5
        tone(ac, 783.99, t + 0.10, 0.22, 0.12, 'sine'); // G5
    }

    /** Hata: düşen çift nota (yumuşak) */
    function playError() {
        const ac = getCtx();
        if (!ac) return;
        const t = ac.currentTime + 0.01;
        tone(ac, 392, t, 0.16, 0.12, 'triangle');       // G4
        tone(ac, 277.18, t + 0.14, 0.28, 0.11, 'triangle'); // C#4
    }

    window.NesilSFX = {
        enabled, setEnabled,
        reply: playReply,
        sent: playSent,
        success: playSuccess,
        error: playError
    };
})();
