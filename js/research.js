/* ========================================================
   NesilAI — İnternet Araştırma Servisi (research.js)
   --------------------------------------------------------
   İki uçlu anahtarsız araştırma zinciri:
   1) DuckDuckGo Instant Answer API  → hızlı özet (ACAO: *)
   2) Wikipedia API (origin=*)       → ansiklopedik arama
   3) DuckDuckGo HTML (r.jina.ai)    → tam arama sonuçları
   Her katman diğerinin CORS bloğuna takıldığında devreye girer.
   Sonuçlar sohbete [KAYNAK] blokları olarak eklenir.
   ======================================================== */
(function () {
    'use strict';

    const TIMEOUT = 12000;

    function withTimeout(ms) {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), ms || TIMEOUT);
        return { signal: c.signal, done: () => clearTimeout(t) };
    }

    async function fetchJson(url, label) {
        const g = withTimeout();
        try {
            const r = await fetch(url, { signal: g.signal });
            if (!r.ok) throw new Error(label + ' HTTP ' + r.status);
            return await r.json();
        } finally { g.done(); }
    }

    async function fetchText(url, label) {
        const g = withTimeout();
        try {
            const r = await fetch(url, { signal: g.signal });
            if (!r.ok) throw new Error(label + ' HTTP ' + r.status);
            return await r.text();
        } finally { g.done(); }
    }

    // --------------------------------------------------------
    // 1) DuckDuckGo Instant Answer
    // --------------------------------------------------------
    async function searchDuckDuckGo(query) {
        const url = 'https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=' + encodeURIComponent(query);
        const json = await fetchJson(url, 'DDG');
        const results = [];

        const push = (item) => {
            if (!item || !item.Text) return;
            results.push({
                title: (item.Text || '').slice(0, 80),
                snippet: item.Text || '',
                url: item.FirstURL || ''
            });
        };

        push(json.Answer ? { Text: String(json.Answer).replace(/<[^>]+>/g, ''), FirstURL: json.AbstractURL } : null);
        if (json.AbstractText) {
            results.push({ title: json.Heading || query, snippet: json.AbstractText, url: json.AbstractURL || '' });
        }
        (json.RelatedTopics || []).forEach(rt => {
            if (rt.Topics) { rt.Topics.forEach(push); } else { push(rt); }
        });

        return results.slice(0, 6);
    }

    // --------------------------------------------------------
    // 2) Wikipedia (CORS dostu: origin=*)
    // --------------------------------------------------------
    async function searchWikipedia(query, lang) {
        const l = lang === 'en' ? 'en' : 'tr';
        const url = 'https://' + l + '.wikipedia.org/w/api.php?action=query&list=search&srsearch='
            + encodeURIComponent(query) + '&srlimit=5&format=json&origin=*';
        const json = await fetchJson(url, 'Wikipedia');

        return (json.query && json.query.search || []).map(item => ({
            title: item.title,
            snippet: String(item.snippet || '').replace(/<[^>]+>/g, ''),
            url: 'https://' + l + '.wikipedia.org/wiki/' + encodeURIComponent(item.title.replace(/\s/g, '_'))
        }));
    }

    // --------------------------------------------------------
    // 3) DuckDuckGo HTML üzerinden tam arama (r.jina.ai okuyucusu)
    //    Not: jina.ai yeni sürümde anahtar isteyebilir; hata olursa
    //    katman sessizce atlanır.
    // --------------------------------------------------------
    async function searchWebResults(query) {
        const url = 'https://r.jina.ai/https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
        const text = await fetchText(url, 'Jina/DDG');
        const results = [];
        const seen = new Set();
        // jina çıktısında başlık + kaynak linki satır satır gelir
        const re = /\[([^\]\n]{8,120})\]\((https?:\/\/[^\)\s]+)\)/g;
        let m;
        while ((m = re.exec(text)) !== null && results.length < 8) {
            const title = m[1].trim();
            const link = m[2];
            if (/duckduckgo\.com|jina\.ai/.test(link) || seen.has(link)) continue;
            seen.add(link);
            // Başlığın hemen altındaki snippet satırını yakalamaya çalış
            const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 400);
            const snipMatch = tail.match(/([^\[\(]{40,300})/);
            results.push({
                title: title,
                snippet: snipMatch ? snipMatch[1].replace(/\s+/g, ' ').trim() : '',
                url: link
            });
        }
        return results;
    }

    // --------------------------------------------------------
    // Sayfa içeriği okuma (raporlar için derin okuma)
    // --------------------------------------------------------
    async function readPage(url) {
        return fetchText('https://r.jina.ai/' + url, 'Jina');
    }

    // --------------------------------------------------------
    // Birleşik araştırma: paralel katmanlar, birleşik sonuç
    // --------------------------------------------------------
    async function research(query, options) {
        const opts = options || {};
        const maxResults = opts.maxResults || 8;
        const lang = opts.lang || 'tr';

        const tasks = [
            searchDuckDuckGo(query).catch(() => []),
            searchWikipedia(query, lang).catch(() => []),
            opts.deep ? searchWebResults(query).catch(() => []) : Promise.resolve([])
        ];

        const settled = await Promise.allSettled(tasks);
        const all = settled
            .filter(s => s.status === 'fulfilled')
            .flatMap(s => s.value);

        // URL + başlık bazlı tekilleştirme
        const seen = new Set();
        const unique = [];
        for (const r of all) {
            const key = r.url || (r.title || '').toLowerCase();
            if (!r.title || seen.has(key)) continue;
            seen.add(key);
            unique.push(r);
            if (unique.length >= maxResults) break;
        }

        if (!unique.length) {
            throw new Error('Araştırma kaynaklarına şu an ulaşılamadı. Bağlantını kontrol edip tekrar dene.');
        }
        return unique;
    }

    /** Sonuçları modele verilecek metin bloğuna çevirir */
    function formatResultsForPrompt(results) {
        return results.map((r, i) =>
            '[' + (i + 1) + '] ' + r.title + '\n' +
            (r.snippet ? r.snippet + '\n' : '') +
            (r.url ? 'Kaynak: ' + r.url : '')
        ).join('\n\n');
    }

    window.NesilResearch = {
        research,
        searchDuckDuckGo,
        searchWikipedia,
        searchWebResults,
        readPage,
        formatResultsForPrompt
    };
})();
