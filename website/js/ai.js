/* ========================================================
   NesilAI — Gerçek Yapay Zeka Sağlayıcı Katmanı (ai.js)

   Bu dosya uygulamanın TEK yapay zeka motorudur.
   - LLM7.io       : tamamen anahtarsız ücretsiz API (varsayılan)
   - Pollinations  : anahtar gerektirmeyen ortak ücretsiz havuz
   - Google Gemini : kullanıcının kendi AI Studio anahtarı (ücretsiz kota)
   - Groq / OpenRouter / OpenAI / Özel (OpenAI uyumlu)

   Not: Hiçbir sağlayıcı yanıt vermezse uygulama SAHTE/ŞABLON cevap
   üretmez; gerçek hatayı kullanıcıya gösterir.
   ======================================================== */
(function () {
    'use strict';

    const SETTINGS_KEY = 'nesilai_ai_settings_v1';

    // Tek seferlik geçiş: Pollinations ücretsiz havuzu sık tıkandığı için
    // anahtarsız ve güvenilir çalışan llm7 varsayılan yapıldı. Eski
    // "pollinations" seçimi bir kez llm7'ye taşınır; kullanıcı sonra
    // istediği sağlayıcıya dönebilir.
    (function migrateDefaultProvider() {
        try {
            if (localStorage.getItem('nesilai_llm7_migration_v1')) return;
            localStorage.setItem('nesilai_llm7_migration_v1', '1');
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return; // Yeni kullanıcı → zaten llm7 varsayılanı
            const saved = JSON.parse(raw) || {};
            if ((saved.provider || 'pollinations') === 'pollinations') {
                saved.provider = 'llm7';
                localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
            }
        } catch (e) { /* localStorage kapalıysa varsayılan yeterli */ }
    })();

    // ========================================================
    // Sağlayıcı Kayıt Defteri (Provider Registry)
    // ========================================================
    const PROVIDERS = {
        llm7: {
            id: 'llm7',
            label: 'LLM7.io (ücretsiz — anahtar yok)',
            short: 'LLM7',
            kind: 'openai',
            chatUrl: 'https://api.llm7.io/v1/chat/completions',
            modelsUrl: 'https://api.llm7.io/v1/models',
            defaultModel: 'codestral-latest',
            suggestedModels: ['codestral-latest', 'minimax-m2.7'],
            needsKey: false,
            vision: false,
            keyUrl: 'https://token.llm7.io/',
            keyHint: 'Ücretsiz token: token.llm7.io — limiti yükseltir, zorunlu değildir.',
            note: 'Tamamen anahtarsız çalışır (günlük ~1M token, hız sınırı var). Ücretsiz token alırsan limitler yükselir.'
        },
        pollinations: {
            id: 'pollinations',
            label: 'Pollinations (ücretsiz — anahtar yok)',
            short: 'Pollinations',
            kind: 'openai',
            chatUrl: 'https://text.pollinations.ai/openai',
            modelsUrl: 'https://text.pollinations.ai/models',
            defaultModel: 'openai-fast',
            suggestedModels: ['openai-fast'],
            needsKey: false,
            vision: false,
            note: 'Ortak ücretsiz havuz. Yoğun saatlerde "429 — kuyruk dolu" dönebilir.'
        },
        gemini: {
            id: 'gemini',
            label: 'Google Gemini (AI Studio anahtarı)',
            short: 'Gemini',
            kind: 'gemini',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            defaultModel: 'gemini-2.5-flash',
            suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-2.0-flash'],
            needsKey: true,
            vision: true,
            keyUrl: 'https://aistudio.google.com/apikey',
            keyHint: 'Google AI Studio ücretsiz katmanı: kredi kartı istemez.'
        },
        groq: {
            id: 'groq',
            label: 'Groq Cloud (ücretsiz kota)',
            short: 'Groq',
            kind: 'openai',
            chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
            modelsUrl: 'https://api.groq.com/openai/v1/models',
            defaultModel: 'llama-3.3-70b-versatile',
            suggestedModels: [
                'llama-3.3-70b-versatile',
                'llama-3.1-8b-instant',
                'openai/gpt-oss-120b',
                'openai/gpt-oss-20b',
                'qwen/qwen3-32b'
            ],
            needsKey: true,
            vision: false,
            keyUrl: 'https://console.groq.com/keys',
            keyHint: 'Groq ücretsiz katmanı çok hızlıdır (LPU).'
        },
        openrouter: {
            id: 'openrouter',
            label: 'OpenRouter (ücretsiz modeller var)',
            short: 'OpenRouter',
            kind: 'openai',
            chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
            modelsUrl: 'https://openrouter.ai/api/v1/models',
            defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
            suggestedModels: [
                'meta-llama/llama-3.3-70b-instruct:free',
                'deepseek/deepseek-chat-v3.1:free',
                'qwen/qwen3-235b-a22b:free',
                'google/gemma-3-27b-it:free'
            ],
            needsKey: true,
            vision: true,
            extraHeaders: { 'X-Title': 'NesilAI' },
            keyUrl: 'https://openrouter.ai/keys',
            keyHint: 'Sonu ":free" ile biten modeller ücretsizdir.'
        },
        openai: {
            id: 'openai',
            label: 'OpenAI (kendi anahtarınla)',
            short: 'OpenAI',
            kind: 'openai',
            chatUrl: 'https://api.openai.com/v1/chat/completions',
            modelsUrl: 'https://api.openai.com/v1/models',
            defaultModel: 'gpt-4o-mini',
            suggestedModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
            needsKey: true,
            vision: true,
            keyUrl: 'https://platform.openai.com/api-keys',
            keyHint: 'OpenAI ücretsiz katman sunmaz; kullanım için bakiye gerekir.'
        },
        custom: {
            id: 'custom',
            label: 'Özel uç nokta (OpenAI uyumlu)',
            short: 'Özel',
            kind: 'openai',
            chatUrl: '',
            modelsUrl: '',
            defaultModel: '',
            suggestedModels: [],
            needsKey: false,
            vision: false,
            editable: true,
            note: 'Ollama, LM Studio, vLLM, DeepSeek, Mistral… OpenAI uyumlu her sunucu.'
        }
    };

    const DEFAULT_SETTINGS = {
        provider: 'llm7',
        keys: {},       // { gemini: '...', groq: '...' }
        models: {},     // { gemini: 'gemini-2.5-flash' }
        baseUrls: {},   // { custom: 'http://localhost:11434/v1' }
        temperature: 0.7,
        systemPrompt: ''
    };

    const DEFAULT_SYSTEM_PROMPT = [
        'Ben NesilAI adında yardımcı bir yapay zeka asistanısın; kendinden asla "Sen NesilAI" diye bahsetme, kim olduğun sorulursa sadece "Ben NesilAI" de ve devamını kısaca söyle.',
        'Sen aslında Bloodline üzerindeki yapay zeka asistanısın; Bloodline\'dan bağımsız herkese yardım etmeyi amaçlıyorsun ve seni Acsida yaptı.',
        '"Seni kim yaptı", "Acsida kim", "yaratıcın kim" sorularına: "Ben aslında Bloodline üzerindeki yapay zeka asistanıyım, burada Bloodline\'dan bağımsız herkese yardım etmeyi amaçlıyorum; beni Acsida yaptı" biçiminde yanıt ver.',
        'Bloodline linki istenirse ya da Bloodline sitesi sorulursa https://bloodline.agentui.app/ adresini ver.',
        'Betty veya Beste kim/dir sorularına: "Acsida\'nın sevdiği kız, diğer ifadeyle sevgilisi" diye yanıt ver.',
        'Kullanıcı Türkçe yazarsa Türkçe, başka bir dilde yazarsa o dilde yanıt ver.',
        'Yanıtların net, doğru ve doğrudan olsun; gereksiz giriş cümlesi ve klişe kullanma.',
        'Bilmediğin bir şeyi uydurma, bilmediğini açıkça söyle.',
        'Kod istenirse markdown kod bloğu içinde, çalışır ve eksiksiz kod ver.',
        'Biçimlendirme için markdown kullan; cevap uzunluğunu sorunun gerektirdiği kadar tut.'
    ].join(' ');

    // ========================================================
    // Ayar Saklama
    // ========================================================
    function getSettings() {
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
        } catch (e) {
            saved = {};
        }
        // Kaldırılmış sağlayıcılar (ör. puter) varsayılana döner
        const KNOWN_PROVIDERS = Object.keys(PROVIDERS);
        return {
            provider: KNOWN_PROVIDERS.indexOf(saved.provider) !== -1 ? saved.provider : DEFAULT_SETTINGS.provider,
            keys: Object.assign({}, saved.keys),
            models: Object.assign({}, saved.models),
            baseUrls: Object.assign({}, saved.baseUrls),
            temperature: typeof saved.temperature === 'number' ? saved.temperature : DEFAULT_SETTINGS.temperature,
            systemPrompt: typeof saved.systemPrompt === 'string' ? saved.systemPrompt : DEFAULT_SETTINGS.systemPrompt
        };
    }

    function saveSettings(patch) {
        const next = Object.assign(getSettings(), patch || {});
        if (patch && patch.keys) next.keys = Object.assign(getSettings().keys, patch.keys);
        if (patch && patch.models) next.models = Object.assign(getSettings().models, patch.models);
        if (patch && patch.baseUrls) next.baseUrls = Object.assign(getSettings().baseUrls, patch.baseUrls);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        emit('settings', next);
        return next;
    }

    function getProvider(id) {
        const settings = getSettings();
        return PROVIDERS[id || settings.provider] || PROVIDERS.pollinations;
    }

    function getApiKey(providerId) {
        const provider = getProvider(providerId);
        return (getSettings().keys[provider.id] || '').trim();
    }

    function getModel(providerId) {
        const provider = getProvider(providerId);
        return (getSettings().models[provider.id] || provider.defaultModel || '').trim();
    }

    // Sağlayıcı kullanıma hazır mı? (anahtar gerekiyorsa anahtar var mı)
    function isReady(providerId) {
        const provider = getProvider(providerId);
        if (provider.needsKey && !getApiKey(provider.id)) {
            return { ok: false, provider: provider, reason: 'missing-key' };
        }
        if (provider.id === 'custom' && !getBaseUrl(provider)) {
            return { ok: false, provider: provider, reason: 'missing-url' };
        }
        if (!getModel(provider.id)) {
            return { ok: false, provider: provider, reason: 'missing-model' };
        }
        return { ok: true, provider: provider };
    }

    function getBaseUrl(provider) {
        const raw = (getSettings().baseUrls[provider.id] || '').trim().replace(/\/+$/, '');
        return raw;
    }

    // ========================================================
    // Olaylar (Settings değişince arayüz güncellenir)
    // ========================================================
    const listeners = {};
    function on(event, handler) {
        (listeners[event] = listeners[event] || []).push(handler);
    }
    function emit(event, payload) {
        (listeners[event] || []).forEach(fn => {
            try { fn(payload); } catch (e) { console.warn('AI listener hatası:', e); }
        });
    }

    // ========================================================
    // Hata Sınıflandırma (kullanıcıya anlamlı mesaj)
    // ========================================================
    function buildError(status, bodyText, provider) {
        let detail = '';
        try {
            const parsed = JSON.parse(bodyText);
            detail = (parsed.error && (parsed.error.message || parsed.error)) || parsed.message || parsed.detail || '';
        } catch (e) {
            detail = (bodyText || '').slice(0, 300);
        }

        let message;
        let kind = 'request';

        if (status === 401 || status === 403) {
            kind = 'auth';
            message = `${provider.short} anahtarını reddetti (${status}). Anahtarın doğru ve yetkili olduğundan emin ol.`;
        } else if (status === 429) {
            kind = 'quota';
            message = `${provider.short} şu an istek limitini aştı (429). Biraz bekleyip tekrar dene ya da Ayarlar'dan başka bir sağlayıcıya geç.`;
        } else if (status === 404) {
            message = `${provider.short} bu modeli bulamadı (404): "${getModel(provider.id)}". Ayarlar'dan model adını kontrol et.`;
        } else if (status >= 500) {
            message = `${provider.short} sunucusunda geçici hata (${status}). Tekrar dene.`;
        } else {
            message = `${provider.short} isteği reddetti (${status}).`;
        }

        // Bazı sağlayıcılar geçersiz anahtarı 400 ile bildirir
        if (/api key not valid|invalid api key|incorrect api key|api key expired/i.test(detail)) {
            kind = 'auth';
            message = `${provider.short} API anahtarını geçersiz buldu. Ayarlar → Yapay Zeka bölümünden doğru anahtarı gir.`;
        }

        if (detail) {
            const clean = String(detail).replace(/\s+/g, ' ').trim();
            if (clean && !message.includes(clean.slice(0, 40))) {
                message += ` → ${clean.slice(0, 260)}`;
            }
        }

        const error = new Error(message);
        error.status = status;
        error.kind = kind;
        error.provider = provider.id;
        return error;
    }

    // ========================================================
    // Zaman Aşımı / İptal Birleştirici
    // ========================================================
    function createSignal(externalSignal, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort(new DOMException('İstek zaman aşımına uğradı', 'TimeoutError'));
        }, timeoutMs);

        let forward = null;
        if (externalSignal) {
            if (externalSignal.aborted) {
                controller.abort();
            } else {
                forward = () => controller.abort();
                externalSignal.addEventListener('abort', forward);
            }
        }

        return {
            signal: controller.signal,
            cleanup: function () {
                clearTimeout(timer);
                if (externalSignal && forward) externalSignal.removeEventListener('abort', forward);
            }
        };
    }

    async function readErrorBody(response) {
        try {
            return await response.text();
        } catch (e) {
            return '';
        }
    }

    // Bazı sağlayıcılar hata durumunda HTTP 200 ile "hata metni" döndürür
    // (örn. Pollinations ücretsiz havuzu tükendiğinde). Bunu cevap sanmayalım.
    const EMBEDDED_ERROR_MARKERS = [
        /has reached its budget/i,
        /queue full/i,
        /\brate limit\b/i,
        /too many requests/i,
        /invalid api key/i,
        /unauthorized/i
    ];

    function checkEmbeddedError(text, provider) {
        if (!EMBEDDED_ERROR_MARKERS.some(re => re.test(text))) return null;

        const error = new Error(
            `${provider.short} ücretsiz havuzu şu an bu isteği karşılayamıyor. ` +
            'Ayarlar → Yapay Zeka bölümünden ücretsiz katman sunan bir sağlayıcı (Google Gemini, Groq, OpenRouter) seçip kendi anahtarını ekle.'
        );
        error.kind = 'quota';
        error.provider = provider.id;
        return error;
    }

    // Pollinations ücretsiz API'si cevapların sonuna reklam altbilgisi ekler
    function stripProviderFooter(text) {
        return text
            .replace(/\n*-{2,}\s*\n*\*\*Support Pollinations[\s\S]*$/i, '')
            .replace(/\n*-{2,}\s*\n*🌸 \*\*Ad\*\* 🌸[\s\S]*$/i, '')
            .replace(/\n*🌸 \*\*Ad\*\* 🌸[\s\S]*$/i, '')
            .trim();
    }

    // Sağlayıcıya özel metin temizliği + gömülü hata kontrolü
    function finalizeText(text, provider) {
        const trimmed = text.trim();

        if (provider.id === 'pollinations') {
            const embedded = checkEmbeddedError(trimmed, provider);
            if (embedded) throw embedded;
            return stripProviderFooter(trimmed);
        }

        return trimmed;
    }

    function normalizeFetchError(error, provider) {
        if (error && error.name === 'AbortError') return error;

        if (error && error.name === 'TimeoutError') {
            const timeout = new Error(`${provider.short} zamanında yanıt vermedi. Bağlantını kontrol edip tekrar dene.`);
            timeout.kind = 'network';
            return timeout;
        }

        if (error instanceof TypeError) {
            const network = new Error(`${provider.short} adresine ulaşılamadı. İnternet bağlantın veya tarayıcı ayarların (CORS/engelleyici) isteği durduruyor olabilir.`);
            network.kind = 'network';
            return network;
        }

        return error;
    }

    // ========================================================
    // Mesaj Dönüşümleri
    // ========================================================
    function toOpenAiMessages(system, messages, visionEnabled) {
        const out = [];
        if (system) out.push({ role: 'system', content: system });

        messages.forEach(msg => {
            const role = msg.role === 'assistant' ? 'assistant' : 'user';
            const images = visionEnabled ? (msg.images || []) : [];

            if (images.length === 0) {
                out.push({ role: role, content: msg.content || '' });
                return;
            }

            const parts = [{ type: 'text', text: msg.content || '' }];
            images.forEach(img => parts.push({ type: 'image_url', image_url: { url: img.dataUrl } }));
            out.push({ role: role, content: parts });
        });

        return out;
    }

    function toGeminiContents(system, messages) {
        const contents = messages.map(msg => {
            const parts = [];
            if (msg.content) parts.push({ text: msg.content });

            (msg.images || []).forEach(img => {
                const base64 = String(img.dataUrl).split(',')[1] || '';
                if (base64) {
                    parts.push({ inlineData: { mimeType: img.mimeType || 'image/png', data: base64 } });
                }
            });

            return {
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: parts.length ? parts : [{ text: '' }]
            };
        });

        const body = { contents: contents };
        if (system) body.systemInstruction = { parts: [{ text: system }] };
        return body;
    }

    // ========================================================
    // SSE Okuyucu
    // ========================================================
    async function streamSse(response, onJson) {
        if (!response.body || !response.body.getReader) {
            // Tarayıcı akışı desteklemiyor → tek parça olarak oku
            const text = await response.text();
            for (const line of text.split('\n')) {
                if (!line.startsWith('data:')) continue;

                const payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;

                let parsed;
                try {
                    parsed = JSON.parse(payload);
                } catch (e) {
                    continue;
                }

                onJson(parsed);
            }
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;

            buffer += decoder.decode(chunk.value, { stream: true });

            let index;
            while ((index = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, index).trim();
                buffer = buffer.slice(index + 1);

                if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;

                const payload = line.slice(5).trim();
                if (!payload) continue;
                if (payload === '[DONE]') return;

                let parsed;
                try {
                    parsed = JSON.parse(payload);
                } catch (e) {
                    // Yarım kalan JSON parçası → sonraki turda tamamlanır
                    continue;
                }

                onJson(parsed);
            }
        }
    }

    function openAiDelta(json) {
        const choice = json && json.choices && json.choices[0];
        if (!choice) return '';
        const delta = choice.delta || {};
        if (typeof delta.content === 'string' && delta.content) return delta.content;
        if (Array.isArray(delta.content)) {
            return delta.content.map(part => part && part.text ? part.text : '').join('');
        }
        if (typeof choice.text === 'string') return choice.text;
        return '';
    }

    function geminiDelta(json) {
        const candidate = json && json.candidates && json.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts) return '';
        return candidate.content.parts.map(part => (part && part.text) ? part.text : '').join('');
    }

    function geminiBlockedError(json, provider) {
        const feedback = json && json.promptFeedback;
        if (feedback && feedback.blockReason) {
            return new Error(`${provider.short} bu isteği güvenlik filtresi nedeniyle reddetti (${feedback.blockReason}).`);
        }
        return null;
    }

    // ========================================================
    // Ana Çağrı: chat()
    //   messages: [{ role: 'user'|'assistant', content, images?: [{dataUrl, mimeType}] }]
    //   onDelta : (textChunk, fullTextSoFar) => void   (opsiyonel → akış)
    //   dönen   : tam yanıt metni
    // ========================================================
    async function chat(options) {
        const opts = options || {};
        const settings = getSettings();
        const provider = getProvider(opts.providerId || settings.provider);
        const messages = (opts.messages || []).filter(m => m && (m.content || (m.images && m.images.length)));
        const system = opts.system !== undefined
            ? opts.system
            : (settings.systemPrompt || DEFAULT_SYSTEM_PROMPT);
        const temperature = typeof opts.temperature === 'number' ? opts.temperature : settings.temperature;

        if (!messages.length) {
            throw new Error('Gönderilecek mesaj yok.');
        }

        const readiness = isReady(provider.id);
        if (!readiness.ok) {
            if (readiness.reason === 'missing-key') {
                throw new Error(`${provider.label} için API anahtarı gerekli. Ayarlar → Yapay Zeka bölümünden anahtarını ekle.`);
            }
            if (readiness.reason === 'missing-url') {
                throw new Error('Özel uç nokta için sunucu adresi (base URL) gerekli. Ayarlar → Yapay Zeka bölümünden ekle.');
            }
            throw new Error('Önce Ayarlar bölümünden bir model seç.');
        }

        if (provider.kind === 'gemini') {
            return chatGemini(provider, messages, system, temperature, opts);
        }
        return chatOpenAiCompatible(provider, messages, system, temperature, opts);
    }

    async function chatOpenAiCompatible(provider, messages, system, temperature, opts) {
        let url = provider.id === 'custom'
            ? getBaseUrl(provider)
            : (opts.baseUrl || provider.chatUrl);

        if (!url) {
            throw new Error('Özel uç nokta adresi boş. Ayarlar → Yapay Zeka bölümünden gir.');
        }
        if (provider.id === 'custom' && !/\/chat\/completions\/?$/.test(url)) {
            url = url + '/chat/completions';
        }

        const key = getApiKey(provider.id);
        const wantStream = typeof opts.onDelta === 'function';
        const wantsVision = messages.some(m => m.images && m.images.length) && provider.vision;

        const headers = { 'Content-Type': 'application/json' };
        if (key) headers['Authorization'] = 'Bearer ' + key;
        if (provider.extraHeaders) Object.assign(headers, provider.extraHeaders);

        const body = {
            model: getModel(provider.id),
            messages: toOpenAiMessages(system, messages, wantsVision),
            temperature: temperature,
            stream: wantStream
        };
        if (provider.id === 'pollinations') body.referrer = 'nesilai';
        if (opts.maxTokens) body.max_tokens = opts.maxTokens;

        const guard = createSignal(opts.signal, opts.timeoutMs || 90000);
        let response;

        try {
            response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: guard.signal
            });
        } catch (error) {
            throw normalizeFetchError(error, provider);
        } finally {
            if (!wantStream) guard.cleanup();
        }

        if (!response.ok) {
            const text = await readErrorBody(response);
            guard.cleanup();
            throw buildError(response.status, text, provider);
        }

        if (!wantStream) {
            guard.cleanup();
            const json = await response.json();
            const choice = json.choices && json.choices[0];
            const content = choice && choice.message ? choice.message.content : '';
            const raw = typeof content === 'string'
                ? content
                : (Array.isArray(content) ? content.map(p => p.text || '').join('') : '');
            if (!raw.trim()) {
                throw new Error(`${provider.short} boş yanıt döndü. Farklı bir model dene.`);
            }
            return { text: finalizeText(raw, provider), model: json.model || getModel(provider.id), provider: provider.id };
        }

        let full = '';
        let streamError = null;

        try {
            await streamSse(response, json => {
                if (json && json.error) {
                    streamError = buildError(json.error.code || json.error.status || 500, JSON.stringify(json), provider);
                    return;
                }

                const delta = openAiDelta(json);
                if (!delta) return;

                full += delta;

                // Hata metni akış içinde gelirse kullanıcıya gösterme
                if (provider.id === 'pollinations') {
                    const embedded = checkEmbeddedError(full, provider);
                    if (embedded) throw embedded;
                }

                opts.onDelta(delta, full);
            });
        } catch (error) {
            throw normalizeFetchError(error, provider);
        } finally {
            guard.cleanup();
        }

        if (streamError && !full) throw streamError;
        if (!full.trim()) {
            throw new Error(`${provider.short} boş yanıt döndü. Farklı bir model dene.`);
        }

        return { text: finalizeText(full, provider), model: getModel(provider.id), provider: provider.id };
    }

    async function chatGemini(provider, messages, system, temperature, opts) {
        const key = getApiKey(provider.id);
        const model = getModel(provider.id);
        const wantStream = typeof opts.onDelta === 'function';

        const method = wantStream ? 'streamGenerateContent' : 'generateContent';
        let url = `${provider.baseUrl}/models/${encodeURIComponent(model)}:${method}`;
        const query = [];
        if (wantStream) query.push('alt=sse');

        const headers = { 'Content-Type': 'application/json' };
        // Anahtar hem başlıkta hem sorguda gönderilebilir; başlık tercih edilir.
        headers['x-goog-api-key'] = key;
        query.push('key=' + encodeURIComponent(key));
        if (query.length) url += '?' + query.join('&');

        const body = toGeminiContents(system, messages);
        body.generationConfig = { temperature: temperature };
        if (opts.maxTokens) body.generationConfig.maxOutputTokens = opts.maxTokens;

        const guard = createSignal(opts.signal, opts.timeoutMs || 90000);
        let response;

        try {
            response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: guard.signal
            });
        } catch (error) {
            throw normalizeFetchError(error, provider);
        } finally {
            if (!wantStream) guard.cleanup();
        }

        if (!response.ok) {
            const text = await readErrorBody(response);
            guard.cleanup();
            throw buildError(response.status, text, provider);
        }

        if (!wantStream) {
            guard.cleanup();
            const json = await response.json();
            const blocked = geminiBlockedError(json, provider);
            if (blocked) throw blocked;
            const text = json.candidates && json.candidates[0]
                ? (json.candidates[0].content && json.candidates[0].content.parts || []).map(p => p.text || '').join('')
                : '';
            if (!text.trim()) throw new Error('Gemini boş yanıt döndü. Farklı bir model dene.');
            return { text: text.trim(), model: model, provider: provider.id };
        }

        let full = '';
        let streamError = null;

        try {
            await streamSse(response, json => {
                const blocked = geminiBlockedError(json, provider);
                if (blocked) {
                    streamError = blocked;
                    return;
                }
                if (json && json.error) {
                    streamError = buildError(json.error.code || 500, JSON.stringify(json), provider);
                    return;
                }
                const delta = geminiDelta(json);
                if (delta) {
                    full += delta;
                    opts.onDelta(delta, full);
                }
            });
        } catch (error) {
            throw normalizeFetchError(error, provider);
        } finally {
            guard.cleanup();
        }

        if (streamError && !full) throw streamError;
        if (!full.trim()) throw new Error('Gemini boş yanıt döndü. Farklı bir model dene.');

        return { text: full.trim(), model: model, provider: provider.id };
    }

    // ========================================================
    // Tek Soru → Tek Cevap Kısayolu
    // ========================================================
    async function ask(prompt, options) {
        const opts = Object.assign({}, options);
        opts.messages = [{ role: 'user', content: prompt }];
        const result = await chat(opts);
        return typeof result === 'string' ? result : result.text;
    }

    // ========================================================
    // Bağlantı Testi + Canlı Model Listesi
    // ========================================================
    async function listModels(providerId) {
        const provider = getProvider(providerId);
        const key = getApiKey(provider.id);

        let url;
        if (provider.id === 'gemini') {
            url = `${provider.baseUrl}/models?key=${encodeURIComponent(key)}`;
        } else if (provider.id === 'custom') {
            const base = getBaseUrl(provider);
            if (!base) throw new Error('Özel uç nokta adresi girilmemiş.');
            url = base + '/models';
        } else {
            url = provider.modelsUrl;
        }

        const headers = {};
        if (key && provider.id !== 'gemini') headers['Authorization'] = 'Bearer ' + key;
        if (provider.extraHeaders) Object.assign(headers, provider.extraHeaders);

        const guard = createSignal(null, 20000);
        let response;
        try {
            response = await fetch(url, { headers: headers, signal: guard.signal });
        } catch (error) {
            throw normalizeFetchError(error, provider);
        } finally {
            guard.cleanup();
        }

        if (!response.ok) {
            throw buildError(response.status, await readErrorBody(response), provider);
        }

        const json = await response.json();
        let models = [];

        if (provider.id === 'gemini') {
            models = (json.models || [])
                .filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1)
                .map(m => String(m.name || '').replace(/^models\//, ''))
                .filter(Boolean);
        } else if (Array.isArray(json.data)) {
            let rows = json.data;
            // Anahtarsız llm7 kullanımı yalnızca ücretsiz katman modelleriyle
            // çalışır; ücretli (usage_based_only) modelleri listelemek hatalı
            // denemelere yol açar.
            if (provider.id === 'llm7' && !key) {
                rows = rows.filter(m => !m.usage_based_only);
            }
            models = rows.map(m => m.id || m.name).filter(Boolean);
        } else if (Array.isArray(json)) {
            models = json.map(m => (typeof m === 'string' ? m : (m.name || m.id))).filter(Boolean);
        }

        return models.sort();
    }

    async function testConnection(providerId) {
        const provider = getProvider(providerId);
        const started = Date.now();
        let models = [];

        try {
            models = await listModels(provider.id);
        } catch (error) {
            // Model listesi alınamadıysa asıl işi (sohbet) deneyerek kesin sonuç al
            try {
                const result = await ask('Yalnızca "bağlantı tamam" yaz.', { providerId: provider.id, timeoutMs: 30000 });
                return {
                    ok: true,
                    provider: provider.id,
                    model: result.model,
                    models: [],
                    ms: Date.now() - started,
                    warning: 'Model listesi alınamadı ama sohbet isteği başarılı.'
                };
            } catch (inner) {
                throw inner;
            }
        }

        const current = getModel(provider.id);
        const result = await ask('Yalnızca "bağlantı tamam" yaz.', { providerId: provider.id, timeoutMs: 30000 });

        return {
            ok: true,
            provider: provider.id,
            model: result.model || current,
            models: models,
            ms: Date.now() - started,
            warning: null
        };
    }

    // ========================================================
    // Dışa Aktarım
    // ========================================================
    window.NesilAI = {
        PROVIDERS: PROVIDERS,
        DEFAULT_SYSTEM_PROMPT: DEFAULT_SYSTEM_PROMPT,
        getSettings: getSettings,
        saveSettings: saveSettings,
        getProvider: getProvider,
        getApiKey: getApiKey,
        getModel: getModel,
        getBaseUrl: getBaseUrl,
        isReady: isReady,
        chat: chat,
        ask: ask,
        listModels: listModels,
        testConnection: testConnection,
        on: on
    };
})();
