/* ========================================================
   NesilAI — Text to Photo (Görsel Oluşturma) Motoru
   Pollinations.ai API Entegrasyonu & Akıllı Niyet Algılama
   ======================================================== */
(function () {
    'use strict';

    // Kullanıcı mesajının bir görsel oluşturma isteği olup olmadığını tespit eder
    function isImagePrompt(text) {
        if (!text) return false;
        const lower = text.toLowerCase().trim();

        // /imagine komutu
        if (lower.startsWith('/imagine')) return true;

        // Kısa ve dağınık istekler de dahil: "bozuk araba fotoğrafı" gibi.
        // Kural: görsel sözcüğü geçmeli VE ya bir eylem ya da resim türü
        // (fotoğraf/portre/manzara…) ya da bir sıfat (bozuk, neon, uzay…)
        // bulunmalı. Sadece kelime geçmesi yetmez; uzun cümlelerde yanlış
        // tetiklemeyi önlemek için cümle 12 sözcükten kısaysa yeterli,
        // uzunsa eylem fiili isteriz.
        const visualWords = [
            'resim', 'resmi', 'görsel', 'fotoğraf', 'fotograf', 'foto', 'çizim', 'cizim',
            'illüstrasyon', 'portrait', 'manzara', 'logo',
            'image', 'picture', 'photo', 'drawing', 'wallpaper', 'duvar kağıdı'
        ];
        const actionWords = [
            'oluştur', 'olustur', 'üret', 'uret', 'çiz', 'ciz', 'yap', 'tasarla',
            'çıkar', 'cikar', 'yarat', 'generate', 'create', 'draw', 'make'
        ];

        // Klasik kalıplar ("resim çiz", "görsel oluştur") doğrudan görsel isteğidir
        const explicit = [
            /(?:resim|görsel|fotoğraf|çizim|illüstrasyon)\s*(?:oluştur|çiz|üret|yap|tasarla|çıkar|yarat)/i,
            /(?:bana|bir)?\s*(?:resim|görsel|fotoğraf)\s*(?:çiz|oluştur|üret|yap)/i,
            /^(?:görsel|resim|fotoğraf|çiz):\s*(.*)/i,
            /(?:generate|create|draw)\s*(?:an?\s*)?(?:image|picture|photo|illustration)/i
        ];
        if (explicit.some(p => p.test(lower))) return true;

        const hasVisual = visualWords.some(w => lower.includes(w));
        if (!hasVisual) return false;

        const hasAction = actionWords.some(w => lower.includes(w));

        // Soru, tavsiye ya da niyet cümleleri görsel üretmez:
        // "fotoğraf çekmek istiyorum hangi telefonu alayım?",
        // "en iyi fotoğraf makineleri", "fotoğraflarımda kim var?"
        const isQuestion = /\?/.test(lower) || /^(nasıl|neden|ne |hangi|kim|nerede|kaç)/.test(lower);
        const isIntentOrAdvice = /(istiyorum|istemek|lazım|gerekli|gerek|önerir|öneri|tavsiye|almalıyım|almam |satın al|fiyat|en iyi|en güzel|en yakın|çekmek|paylaşmak|bulmak|kimdir)/.test(lower);
        if (isQuestion && !hasAction) return false;
        if (isIntentOrAdvice) return false;

        // Kısa özne ifadeleri görsel isteğidir: "bozuk araba fotoğrafı",
        // "neon ışıklı siberpunk şehir", "uzayda yüzen kedi resmi"
        const wordCount = lower.split(/\s+/).length;
        return wordCount <= 10 || hasAction;
    }

    // Komut kalıplarını temizleyip saf görsel tasvirini çıkarır
    function extractImagePrompt(text) {
        if (!text) return '';
        let clean = text.trim();

        // /imagine temizliği
        clean = clean.replace(/^\/imagine\s+/i, '');

        // Ön ekleri ve fiilleri temizle
        clean = clean
            .replace(/^(?:lütfen\s+)?(?:bana\s+)?(?:bir\s+)?/i, '')
            .replace(/(?:resmi|görseli|fotoğrafı|resim|görsel|fotoğraf|foto)?\s*(?:oluştur|olustur|çiz|ciz|üret|uret|yap|tasarla|çıkar|cikar|yarat)\s*(?:mısın|misin|musun)?\.?$/i, '')
            .replace(/^(?:görsel|resim|fotoğraf|çiz):\s*/i, '')
            .replace(/^(?:resim|görsel|fotoğraf)\s+(?:olarak\s+)?/i, '')
            .trim();

        return clean || text;
    }

    // Pollinations.ai görsel URL'si üretir
    function generateImageUrl(prompt, width = 1024, height = 768) {
        const seed = Math.floor(Math.random() * 1000000);
        const encoded = encodeURIComponent(prompt);
        return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`;
    }

    // Sohbet mesajının içine zengin görsel kartı ekler
    function appendImageCard(container, promptText, customUrl = null) {
        const imageUrl = customUrl || generateImageUrl(promptText);

        const card = document.createElement('div');
        card.className = 'generated-image-card';

        // Skeleton yükleme alanı
        const skeleton = document.createElement('div');
        skeleton.className = 'image-loading-skeleton';
        skeleton.innerHTML = `
            <div style="font-size: 28px;">🎨</div>
            <div>Görseliniz oluşturuluyor...</div>
            <div style="font-size: 11px; opacity: 0.7;">"${promptText.slice(0, 50)}..."</div>
        `;
        card.appendChild(skeleton);

        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.alt = promptText;
        img.style.display = 'none';

        img.onload = () => {
            skeleton.remove();
            img.style.display = 'block';

            // Alt indirme çubuğu
            const footer = document.createElement('div');
            footer.className = 'image-card-footer';
            footer.innerHTML = `
                <span>🎨 NesilAI Görsel Motoru</span>
                <button class="btn-download-img" title="Görseli İndir">
                    <span>⬇️</span> İndir
                </button>
            `;

            footer.querySelector('.btn-download-img').addEventListener('click', async () => {
                try {
                    const res = await fetch(imageUrl);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `nesilai-${Date.now()}.jpg`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (e) {
                    window.open(imageUrl, '_blank');
                }
            });

            card.appendChild(footer);
        };

        img.onerror = () => {
            skeleton.innerHTML = `
                <div style="color: #ef4444; font-size: 24px;">❌</div>
                <div>Görsel oluşturulamadı. Lütfen tekrar deneyin.</div>
            `;
        };

        img.src = imageUrl;
        card.appendChild(img);
        container.appendChild(card);
    }

    window.NesilT2P = {
        isImagePrompt,
        extractImagePrompt,
        generateImageUrl,
        appendImageCard
    };

})();
