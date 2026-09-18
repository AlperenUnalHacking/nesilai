/* ========================================================
   NesilAI — Kalıcı Bellek Servisi (memory.js)
   --------------------------------------------------------
   Kullanıcının adı, soyadı, doğum yılı, projeleri, evcil
   hayvan adı gibi kalıcı bilgilerini çıkarır ve IndexedDB
   yerine güvenilir localStorage'da saklar. Yeni sohbetlerde
   bu bilgiler sistem promptuna otomatik eklenir.
   - Gizlilik: veri yalnızca bu cihazda durur.
   - Kapatılabilir: Ayarlar → Bellek.
   ======================================================== */
(function () {
    'use strict';

    const LS_KEY = 'nesilai_memories_v1';
    const TOGGLE_KEY = 'nesilai_memory_enabled';
    const MAX_MEMORIES = 200;

    // ========================================================
    // Saklama
    // ========================================================
    function getAll() {
        try {
            const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
            return Array.isArray(raw) ? raw : [];
        } catch (e) { return []; }
    }

    function saveAll(list) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, MAX_MEMORIES)));
            return true;
        } catch (e) { return false; }
    }

    function isEnabled() {
        return localStorage.getItem(TOGGLE_KEY) !== 'false';
    }

    function setEnabled(v) {
        localStorage.setItem(TOGGLE_KEY, v ? 'true' : 'false');
    }

    function normalize(text) {
        return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function add(content, category, source) {
        const clean = String(content || '').replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '');
        if (clean.length < 4 || clean.length > 300) return null;

        const list = getAll();
        const norm = normalize(clean);
        // Aynı bilgiyi iki kez kaydetme
        if (list.some(m => m.norm === norm)) return null;

        const rec = {
            id: 'mem_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
            content: clean,
            category: category || 'Genel',
            source: source || 'chat',
            createdAt: Date.now(),
            norm: norm
        };
        list.unshift(rec);
        saveAll(list);
        return rec;
    }

    function remove(id) {
        const list = getAll().filter(m => m.id !== id);
        saveAll(list);
    }

    function clear() {
        try { localStorage.removeItem(LS_KEY); } catch (e) { }
    }

    function count() { return getAll().length; }

    // ========================================================
    // Çıkarım (Memory Extraction)
    // Kalıcı olabilecek kalıpları yakalar; anlık konuşma cümlelerini
    // yok sayar. Türkçe önce, sonra İngilizce kalıplar.
    // ========================================================
    const NAME_T = '([A-ZÇĞİÖŞÜA-Z][a-zçğıöşüA-ZÇĞİÖŞÜa-z]{1,30})';

    const PATTERNS = [
        // --- Kimlik ---
        { re: new RegExp('(?:benim\\s+)?(?:ad|isim)\\s*(?:ım|im|m)?\\s*[:=]?\\s*' + NAME_T, 'iu'), cat: 'Kimlik', fmt: m => 'Kullanıcının adı: ' + m[1] },
        { re: new RegExp('my name is\\s+([A-Za-z]{2,30})', 'iu'), cat: 'Kimlik', fmt: m => 'Kullanıcının adı: ' + m[1] },
        { re: new RegExp('(?:benim\\s+)?soyad(?:ım|im|m)?\\s*[:=]?\\s*' + NAME_T, 'iu'), cat: 'Kimlik', fmt: m => 'Kullanıcının soyadı: ' + m[1] },
        { re: new RegExp('(?:yaş\\s*ım|yaşım|yaşim)\\s*[:=]?\\s*(\\d{1,3})', 'iu'), cat: 'Kimlik', fmt: m => 'Kullanıcının yaşı: ' + m[1] },
        { re: /(\d{1,3})\s*yaşındayım/iu, cat: 'Kimlik', fmt: m => 'Kullanıcının yaşı: ' + m[1] },
        { re: /i am\s+(\d{1,3})\s*years old/iu, cat: 'Kimlik', fmt: m => 'Kullanıcının yaşı: ' + m[1] },
        { re: /(\d{4})\s*(?:doğumlu|doğum yılı)/iu, cat: 'Kimlik', fmt: m => 'Kullanıcının doğum yılı: ' + m[1] },
        { re: /i was born in\s+(\d{4})/iu, cat: 'Kimlik', fmt: m => 'Kullanıcının doğum yılı: ' + m[1] },

        // --- Konum / meslek / okul ---
        { re: new RegExp("(?:ben\\s+)?" + NAME_T + "(?:['\u2019]?(?:de|da))?\\s+(?:yaşıyorum|oturuyorum|ikamet)", 'iu'), cat: 'Kişisel', fmt: m => 'Kullanıcı ' + m[1] + ' adresinde yaşıyor' },
        { re: /i live in\s+([A-Za-zÇĞİÖŞÜçğıöşü\s]{2,40})/iu, cat: 'Kişisel', fmt: m => 'Kullanıcı ' + m[1].trim() + ' adresinde yaşıyor' },
        { re: new RegExp('(?:mesle(?:ğ|g)im|meslegim)\\s*[:=]?\\s*' + NAME_T, 'iu'), cat: 'İş', fmt: m => 'Kullanıcının mesleği: ' + m[1] },
        { re: /i work as\s+(?:an?\s+)?([A-Za-z\s]{2,40})/iu, cat: 'İş', fmt: m => 'Kullanıcının mesleği: ' + m[1].trim() },
        { re: /(öğrenciyim|universitede okuyorum|üniversitede okuyorum|lisede okuyorum)/iu, cat: 'Kişisel', fmt: m => 'Kullanıcı öğrenci (' + m[1] + ')' },

        // --- Evcil hayvan ---
        { re: new RegExp("(?:kedi|köpek|kopek|kuş|kuş|balık|balik|hamster|kaplumbağa)(?:[ıi]m|m)?(?:[ıi]n[ıi]?m?|[ıi]m[ıi]n)?\\s+(?:ad[ıi]|isim[i]?)\\s*[:=]?\\s*" + NAME_T, 'iu'), cat: 'Kişisel', fmt: m => 'Kullanıcının evcil hayvanının adı: ' + m[1] },
        { re: /my (?:pet|dog|cat)(?:'s)?\s+name is\s+([A-Za-z]{2,20})/iu, cat: 'Kişisel', fmt: m => 'Kullanıcının evcil hayvanının adı: ' + m[1] },

        // --- Tercihler ---
        { re: /(?:en\s+)?(?:sevdiğim|sevdigim|hoşuma giden|favori)\s+(?:programlama\s+dili|dil)\s*[:=]?\s*([A-Za-zçğıöşüÇĞİÖŞÜ#+.\s]{1,30})/iu, cat: 'Tercih', fmt: m => 'Kullanıcının favori programlama dili: ' + m[1].trim() },
        { re: /(?:sevdiğim|sevdigim|favori)\s+(?:renk)\s*[:=]?\s*([a-zçğıöşü]{2,15})/iu, cat: 'Tercih', fmt: m => 'Kullanıcının favori rengi: ' + m[1] },
        { re: /my favorite(?:\s+\w+)?\s+is\s+([A-Za-z\s]{2,30})/iu, cat: 'Tercih', fmt: m => 'Kullanıcının favorisi: ' + m[1].trim() },
        { re: /(koyu|açık|dark|light)\s+tema(?:yı)?\s+(?:seviyorum|kullanıyorum|tercih)/iu, cat: 'Tercih', fmt: m => 'Kullanıcı ' + m[1] + ' temayı seviyor' },

        // --- Teknoloji / iş ---
        { re: /(?:ben\s+)?(javascript|typescript|python|java|c\+\+|c#|php|ruby|go|rust|kotlin|swift|dart|flutter|react|vue|angular|next\.?js|node\.?js|html|css|sql|unity|unreal)\s*(?:kullanıyorum|bilirim|yazıyorum|öğreniyorum)/iu, cat: 'Teknoloji', fmt: m => 'Kullanıcı ' + m[1] + ' kullanıyor' },
        { re: /i (?:use|code in|work with)\s+(javascript|typescript|python|java|c\+\+|php|go|rust|react|vue|flutter)/iu, cat: 'Teknoloji', fmt: m => 'Kullanıcı ' + m[1] + ' kullanıyor' },

        // --- Projeler ---
        // Uzun alternasyon önce: "mizin" -> "min" -> "m" (kısa eşleşme "in" yakalamasın)
        { re: /proje(?:mizin|m[min]?|m)?\s+ad[ıi]\s*[:=]?\s*([A-Za-zÇĞİÖŞÜçğıöşü0-9_\-\.]{2,40})/iu, cat: 'Proje', fmt: m => 'Kullanıcının projesi: ' + m[1] },
        { re: /proje(?:sinin|min)?\s+ad[ıi]\s*[:=]?\s*([A-Za-zÇĞİÖŞÜçğıöşü0-9_\-\.]{2,40})/iu, cat: 'Proje', fmt: m => 'Kullanıcının projesi: ' + m[1] },
        { re: /my project(?:'s)?(?:\s+name)?\s+is\s+(?:called\s+)?([A-Za-z0-9_\-\.]{2,40})/iu, cat: 'Proje', fmt: m => 'Kullanıcının projesi: ' + m[1] }
    ];

    const IGNORE_RE = /^(?:bugün|yarın|şimdi|simdi|acaba|tamam|merhaba|selam|hey|nasılsın|ne yaptın)/iu;

    function extractFromText(text) {
        const found = [];
        if (!isEnabled()) return found;
        const src = String(text || '').trim();
        if (src.length < 4 || src.length > 2000) return found;
        if (IGNORE_RE.test(src) && src.length < 25) return found;

        // Cümlelere böl; kalıp cümle içinde aranır
        const sentences = src.split(/(?<=[.!?;])\s+|\n+/);

        sentences.forEach(sentence => {
            const s = sentence.trim();
            if (s.length < 4) return;

            PATTERNS.forEach(p => {
                if (found.length >= 8) return;
                const m = s.match(p.re);
                if (!m) return;
                let content;
                try {
                    content = p.fmt ? p.fmt(m) : s;
                } catch (e) { content = s; }
                if (!content) return;
                // Yeterli bilgi içermeyen çok kısa yakalamaları ele
                if (content.length < 6) return;
                found.push({ content: content, category: p.cat });
            });
        });

        return found;
    }

    /** Kullanıcı mesajından bellek çıkarıp saklar. Eklenen kayıt sayısını döndürür. */
    function extractAndStore(text) {
        if (!isEnabled()) return 0;
        const found = extractFromText(text);
        let added = 0;
        found.forEach(f => {
            if (add(f.content, f.category, 'chat')) added++;
        });
        return added;
    }

    // ========================================================
    // Sistem promptuna enjeksiyon
    // ========================================================
    function buildMemoryContext() {
        if (!isEnabled()) return '';
        const list = getAll();
        if (!list.length) return '';

        const lines = list.slice(0, 40).map(m => '- [' + m.category + '] ' + m.content);
        return [
            'KALICI KULLANICI BELLEĞİ (bu cihazda saklanan geçmiş bilgiler):',
            lines.join('\n'),
            'Bu bilgileri hatırlıyormuş gibi doğal biçimde kullan; kullanıcı sorduğunda hatırla, gereksiz yere tekrar etme.'
        ].join('\n');
    }

    window.NesilMemory = {
        getAll, add, remove, clear, count,
        isEnabled, setEnabled,
        extractFromText, extractAndStore,
        buildMemoryContext
    };
})();
