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

    // Görsel sağlayıcı zinciri — BAĞIMSIZ backend'ler sırayla denenir:
    //   1) Pollinations → anahtarsız, hızlı (önbellek isabetinde anında). Anonim
    //      kota bittiğinde 200 + JSON (402 INSUFFICIENT_BALANCE) döner; <img> bunu
    //      yükleyemediği için onerror düşer ve sıradaki sağlayıcıya geçilir.
    //   2) AI Horde → topluluk GPU ağı (stablehorde.net); tamamen ücretsiz,
    //      anahtarsız ve Pollinations'tan TAMAMEN bağımsız. Base64 webp döner,
    //      tarayıcıda blob'a çevrilir → IndexedDB kalıcılığı da çalışır.
    // Tarih notu: eskiden zincirdeki "flux/turbo" varyantları da aynı Pollinations
    // backend'ine gittiği için tek sağlayıcı düşince üçü birden çöküyordu → kaldırıldı.
    const POLLINATIONS_TOKEN = (() => {
        try { return localStorage.getItem('nesilai_pollinations_token') || ''; } catch (e) { return ''; }
    })();

    const IMAGE_PROVIDERS = [
        {
            name: 'Pollinations',
            build: (p, w, h, seed) => 'https://image.pollinations.ai/prompt/' + encodeURIComponent(p) +
                '?width=' + w + '&height=' + h + '&seed=' + seed + '&nologo=true&referrer=nesilai' +
                (POLLINATIONS_TOKEN ? '&token=' + encodeURIComponent(POLLINATIONS_TOKEN) : '')
        },
        {
            name: 'AI Horde',
            horde: true // URL tabanlı değil — aşağıdaki tryAiHorde ile çalışır
        }
    ];

    const IMAGE_FALLBACK_SEED = () => Math.floor(Math.random() * 1000000);

    // Tek sağlayıcıya tek deneme: min 12 saniye görsel bekler
    function tryImageProvider(providerDef, prompt, width, height, seed, signal) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const timer = setTimeout(() => {
                img.src = '';
                reject(new Error(providerDef.name + ' zaman aşımı'));
            }, 45000);
            if (signal) {
                signal.addEventListener('abort', () => {
                    clearTimeout(timer);
                    img.src = '';
                    reject(new Error('iptal'));
                }, { once: true });
            }
            img.onload = () => { clearTimeout(timer); resolve({ url: img.src, provider: providerDef.name }); };
            img.onerror = () => { clearTimeout(timer); reject(new Error(providerDef.name + ' başarısız')); };
            img.src = providerDef.build(prompt, width, height, seed);
        });
    }

    /**
     * Anahtarsız görsel üretimi — sağlayıcı zincirli.
     * Döner: { url, provider, attempts: [denenen sağlayıcılar] }
     * UI göstermek istemezse URL'yi doğrudan da kullanabilirsin.
     */
    async function generateImageWithFallback(prompt, width = 1024, height = 768, opts = {}) {
        const attempts = [];
        for (const def of IMAGE_PROVIDERS) {
            try {
                let ok;
                if (def.horde) {
                    attempts.push({ name: def.name });
                    ok = await tryAiHorde(prompt, width, height, opts.signal);
                } else {
                    const seed = IMAGE_FALLBACK_SEED();
                    attempts.push({ name: def.name, url: def.build(prompt, width, height, seed) });
                    ok = await tryImageProvider(def, prompt, width, height, seed, opts.signal);
                }
                return { url: ok.url, provider: ok.provider, attempts };
            } catch (e) {
                if (opts.signal && opts.signal.aborted) throw e;
                // sıradaki sağlayıcıyı dene
            }
        }
        const err = new Error('Tüm görsel sağlayıcıları şu an yanıt vermedi. Lütfen tekrar dene.');
        err.attempts = attempts;
        throw err;
    }

    // ----------------------------------------------------------
    // AI Horde — topluluk GPU ağı (bağımsız yedek sağlayıcı)
    // ----------------------------------------------------------
    // API tarayıcıya CORS izni verir (access-control-allow-origin: *) ve
    // r2:false ile görseli base64 webp olarak döndürür → CORS'suz imaj
    // CDN'leri gibi fetch sorunu yaşatmaz.
    const HORDE_AGENT = 'NesilAI:1.0:web';
    const HORDE_POLL_MS = 2500;
    const HORDE_TIMEOUT_MS = 150000;

    function hordeBase64ToBlobUrl(b64) {
        const clean = String(b64).replace(/^data:[^,]+,/, '');
        const bin = atob(clean);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type: 'image/webp' }));
    }

    async function tryAiHorde(prompt, width, height, signal) {
        // 1) İşi kuyruğa bırak (anonim anahtar: 0000000000 — tamamen ücretsiz)
        const submitRes = await fetch('https://aihorde.net/api/v2/generate/async', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': '0000000000',
                'Client-Agent': HORDE_AGENT
            },
            body: JSON.stringify({
                prompt: prompt,
                params: { width: width, height: height, steps: 22, cfg_scale: 7, sampler_name: 'k_euler_a' },
                nsfw: false,
                censor_nsfw: true,
                r2: false // base64 dönsün — görsel CDN'i CORS'suz olduğundan blob'a çevrilir
            }),
            signal: signal
        });
        if (!submitRes.ok) {
            throw new Error('AI Horde işi kabul etmedi (' + submitRes.status + ')');
        }
        const submit = await submitRes.json();
        if (!submit || !submit.id) {
            throw new Error('AI Horde iş kimliği alınamadı');
        }

        // 2) Tamamlanmayı bekle (anonim kuyruk: tipik 5 sn – 2 dk)
        const started = Date.now();
        while (Date.now() - started < HORDE_TIMEOUT_MS) {
            if (signal && signal.aborted) {
                throw new DOMException('İşlem kullanıcı tarafından durduruldu', 'AbortError');
            }
            await new Promise(r => setTimeout(r, HORDE_POLL_MS));

            let check;
            try {
                const res = await fetch('https://aihorde.net/api/v2/generate/check/' + submit.id, { signal: signal });
                check = await res.json();
            } catch (e) {
                continue; // tek anket hatası ölüm değil
            }

            if (check.faulted) throw new Error('AI Horde işi hata verdi');
            if (check.is_possible === false) throw new Error('AI Horde şu an bu isteği karşılayamıyor');
            if (check.kudos && check.kudos < 0) throw new Error('AI Horde kota reddi (kudos)');
            if (check.done) {
                // 3) Sonucu al (status çağrısı işi tüketir)
                const statusRes = await fetch('https://aihorde.net/api/v2/generate/status/' + submit.id, { signal: signal });
                if (!statusRes.ok) throw new Error('AI Horde sonuç döndürmedi (' + statusRes.status + ')');
                const status = await statusRes.json();
                const gen = status && status.generations && status.generations[0];
                if (!gen || !gen.img) {
                    // İş bitti ama görsel yoksa Horde censored/generations boş dönmüş olabilir
                    throw new Error('AI Horde görsel döndürmedi');
                }
                return {
                    url: hordeBase64ToBlobUrl(gen.img),
                    provider: 'AI Horde' + (gen.model ? ' · ' + gen.model : '')
                };
            }
        }
        throw new Error('AI Horde zaman aşımı — kuyruk çok uzun, tekrar dene');
    }

    // Pollinations.ai görsel URL'si üretir (geriye dönük uyumluluk — son çare kart URL'i)
    function generateImageUrl(prompt, width = 1024, height = 768) {
        const seed = Math.floor(Math.random() * 1000000);
        const encoded = encodeURIComponent(prompt);
        return 'https://image.pollinations.ai/prompt/' + encoded +
            '?width=' + width + '&height=' + height + '&seed=' + seed + '&nologo=true&referrer=nesilai' +
            (POLLINATIONS_TOKEN ? '&token=' + encodeURIComponent(POLLINATIONS_TOKEN) : '');
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
            <div style="font-size: 28px; color: #a9baff;"><svg class="icon" aria-hidden="true"><use href="#i-palette"/></svg></div>
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
                <span>NesilAI Görsel Motoru</span>
                <button class="btn-download-img" title="Görseli İndir">
                    <svg class="icon" aria-hidden="true"><use href="#i-download"/></svg> İndir
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
                <div style="color: #ef4444; font-size: 24px;"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></div>
                <div>Görsel oluşturulamadı. Lütfen tekrar deneyin.</div>
            `;
        };

        img.src = imageUrl;
        card.appendChild(img);
        container.appendChild(card);
    }

    // ----------------------------------------------------------
    // Prompt Çevirisi — Türkçe görsel promptlarını İngilizce'ye çevirir
    // ----------------------------------------------------------
    // Pollinations (ve genel olarak dağıtım modelleri) İngilizce
    // promptlarla belirgin biçimde daha iyi sonuç verir. Strateji:
    //   1) Kullanıcının LLM7 anahtarsız sohbet modeli çevirir (kaliteli, bağlam duyarlı)
    //   2) Olmazsa Pollinations metin modeli denenebilir (aynı ücretsiz havuz)
    //   3) Her iki yol da başarısızsa: küçük yerel sözlük + son çare orijinal prompt
    // Uygulama hızı için sonuçlar 100 kayıta kadar önbelleklenir.
    const TRANSLATE_TIMEOUT_MS = 12000;
    const translateCache = new Map();

    const FALLBACK_TR_EN = {
        'kedi': 'cat', 'köpek': 'dog', 'araba': 'car', 'bozuk': 'broken',
        'uzay': 'space', 'uzayda': 'in space', 'yüzen': 'floating',
        'şehir': 'city', 'orman': 'forest', 'dağ': 'mountain', 'dağlar': 'mountains',
        'deniz': 'sea', 'okyanus': 'ocean', 'gökyüzü': 'sky', 'güneş': 'sun',
        'ay': 'moon', 'yıldız': 'star', 'yıldızlar': 'stars', 'nebula': 'nebula',
        'gece': 'night', 'gündüz': 'day', 'gün batımı': 'sunset', 'gün doğumu': 'sunrise',
        'kadın': 'woman', 'erkek': 'man', 'çocuk': 'child', 'insan': 'person',
        'ev': 'house', 'ağaç': 'tree', 'ağaçlar': 'trees', 'çiçek': 'flower',
        'kuş': 'bird', 'at': 'horse', 'aslan': 'lion', 'kurt': 'wolf',
        'nehir': 'river', 'göl': 'lake', 'kar': 'snow', 'yağmur': 'rain',
        'sis': 'fog', 'bulut': 'cloud', 'bulutlar': 'clouds', 'fırtına': 'storm',
        'siberpunk': 'cyberpunk', 'neon': 'neon', 'renkli': 'colorful', 'renk': 'color',
        'ışıklı': 'lit', 'ışıklar': 'lights',
        'manzara': 'landscape', 'portre': 'portrait', 'doğa': 'nature',
        'fotoğraf': 'photo', 'fotoğrafı': 'photo', 'fotoğraf': 'photo',
        'resim': 'picture', 'resmi': 'picture', 'görsel': 'image', 'görseli': 'image',
        'çizim': 'drawing', 'tablo': 'painting', 'sanat': 'art', 'sanatçı': 'artist',
        'dijital': 'digital', 'gerçekçi': 'realistic', 'detaylı': 'detailed',
        'uçan': 'flying', 'koşan': 'running', 'dans': 'dance', 'savaş': 'war',
        'yanan': 'burning', 'yüzen': 'floating', 'parlayan': 'glowing', 'akan': 'flowing',
        'düşen': 'falling', 'doğan': 'rising', 'batan': 'setting', 'dönen': 'spinning',
        'patlayan': 'exploding', 'uyuyan': 'sleeping', 'bakan': 'looking', 'gülen': 'smiling',
        'ejderha': 'dragon', 'kılıç': 'sword', 'zırh': 'armor', 'robot': 'robot',
        'yüz': 'face', 'göz': 'eye', 'saç': 'hair', 'el': 'hand', 'kalp': 'heart',
        'kızılötesi': 'infrared', 'su altı': 'underwater', 'volkan': 'volcano',
        'kale': 'castle', 'köy': 'village', 'kule': 'tower', 'köprü': 'bridge',
        'beyaz': 'white', 'siyah': 'black', 'kırmızı': 'red', 'mavi': 'blue',
        'yeşil': 'green', 'sarı': 'yellow', 'mor': 'purple', 'turuncu': 'orange',
        'pembe': 'pink', 'altın': 'golden', 'gümüş': 'silver',
        'büyük': 'large', 'küçük': 'small', 'eski': 'old', 'yeni': 'new',
        'güzel': 'beautiful', 'harika': 'amazing', 'mutlu': 'happy', 'üzgün': 'sad',
        'hızlı': 'fast', 'yavaş': 'slow', 'sıcak': 'hot', 'soğuk': 'cold',
        'içinde': 'inside', 'üstünde': 'on top of', 'altında': 'under', 'yanında': 'next to',
        'ile': 'with', 've': 'and', 'üzerinde': 'on', 'yakınında': 'near'
    };

    function localFallbackTranslate(text) {
        let hit = 0;
        const out = text.replace(/[\p{L}\p{M}]+/gu, (word) => {
            const en = lookupTrWord(word);
            if (en !== undefined) { hit++; return en; }
            return word;
        });
        // Yarıdan azı çevrildiyse orijinali koru (anlamsız karışım üretme)
        const total = (text.match(/[\p{L}\p{M}]+/gu) || []).length;
        return hit > 0 && hit * 2 > total ? out : text;
    }

    // Türkçe çekim ekleri: "gökyüzünde" → gökyüzü, "kedimi" → kedi gibi.
    // Uzun ekler önce denenir; kök sözlükte yoksa kelime olduğu gibi kalır.
    const TR_SUFFIXES = [
        "'nde", "'nda", "'nde", "'nda", "'den", "'dan", "'te", "'ta", "'nin", "'nın", "'nun", "'nün", "'yi", "'yı", "'yu", "'yü",
        'ndeki', 'ndaki', 'ları', 'leri', 'nden', 'ndan', 'ntan', 'ntn',
        'mız', 'miz', 'muz', 'müz', 'ınız', 'iniz', 'unuz', 'ünüz',
        'nde', 'nda', 'den', 'dan', 'ten', 'tan', 'nın', 'nin', 'nun', 'nün',
        'sını', 'sini', 'sı', 'si', 'su', 'sü', 'ya', 'ye', 'yı', 'yü',
        'da', 'de', 'ta', 'te', 'ın', 'in', 'un', 'ün', 'ı', 'i', 'u', 'ü', 'a', 'e'
    ];

    function lookupTrWord(word) {
        const key = word.toLocaleLowerCase('tr');
        if (FALLBACK_TR_EN[key] !== undefined) return FALLBACK_TR_EN[key];
        if (key.indexOf("'") !== -1) {
            const stem = key.split("'")[0];
            if (FALLBACK_TR_EN[stem] !== undefined) return FALLBACK_TR_EN[stem];
        }
        for (let s = 0; s < TR_SUFFIXES.length; s++) {
            const suf = TR_SUFFIXES[s];
            if (key.length > suf.length + 2 && key.slice(-suf.length) === suf) {
                const stem = key.slice(0, -suf.length);
                if (FALLBACK_TR_EN[stem] !== undefined) return FALLBACK_TR_EN[stem];
            }
        }
        return undefined;
    }

    function isEnglish(text) {
        // Tipik Türkçe karakterler varsa İngilizce değildir
        if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return false;
        // Yaygın Türkçe işlev sözcükleri geçiyorsa İngilizce değildir
        if (/\b(bir|ve|ile|için|gibi|olan|üzerinde|içinde|renkli)\b/i.test(text)) return false;
        // İngilizce işlev sözcükleri barındırıyorsa İngilizce say
        return /\b(the|and|of|with|in|on|at|a|an|is|are)\b/i.test(text) ||
               !/[\p{Lu}]/u.test(text) && !/[çğıöşü]/i.test(text);
    }

    async function translatePrompt(text) {
        const prompt = (text || '').trim();
        if (!prompt) return prompt;
        // Zaten İngilizceyse çevirme
        if (isEnglish(prompt)) return prompt;
        // Önbellek
        const cached = translateCache.get(prompt);
        if (cached) return cached;

        let translated = null;
        // 1) Anahtarsız LLM7 yolu
        try {
            if (window.NesilAI && typeof window.NesilAI.ask === 'function') {
                const sys = 'You are a precise Turkish-to-English translator for image generation prompts. ' +
                    'Output ONLY the English translation - no explanations, no quotes, no extra words. ' +
                    'Preserve every detail of the original meaning exactly.';
                const userMsg = 'Translate this image prompt to English, preserving all meaning:\n\n' + prompt;
                const res = await Promise.race([
                    window.NesilAI.ask(userMsg, { system: sys, temperature: 0.1 }),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TRANSLATE_TIMEOUT_MS))
                ]);
                const clean = String(res || '').trim().replace(/^"|"$/g, '');
                if (clean && clean.length <= prompt.length * 4 + 40) translated = clean;
            }
        } catch (e) { /* aşağıya düş */ }

        // 2) Yerel sözlük yolu
        if (!translated) {
            const local = localFallbackTranslate(prompt);
            if (local !== prompt) translated = local;
        }

        // 3) Son çare: orijinal
        const finalPrompt = translated || prompt;
        if (translateCache.size > 100) translateCache.clear();
        translateCache.set(prompt, finalPrompt);
        return finalPrompt;
    }

    window.NesilT2P = {
        isImagePrompt,
        extractImagePrompt,
        generateImageUrl,
        generateImageWithFallback,
        appendImageCard,
        translatePrompt
    };

})();
