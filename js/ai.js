/* ========================================================
   NesilAI — Gerçek Yapay Zeka Sağlayıcı Katmanı (ai.js)

   Bu dosya uygulamanın TEK yapay zeka motorudur.
   - NesilAI YZ      : anahtarsız ücretsiz motorlar (llm7 + pollinations)
   - Google Gemini   : kullanıcının kendi AI Studio anahtarı (ücretsiz kota)
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
    //
    // needsKey:false olan iki kayıt (llm7 ve pollinations) arayüzde TEK
    // marka olarak gösterilir: "NesilAI YZ". llm7 asıl motor,
    // pollinations otomatik yedektir (429/quota durumunda devreye girer).
    // Kullanıcı Ayarlar → Yapay Zeka → "NesilAI YZ modeli" ile gerçek
    // modeli seçer (minimax, codestral, GLM, Mistral Nemo).
    // ========================================================
    const BRAND_NAME = 'NesilAI YZ';

    const PROVIDERS = {
        llm7: {
            id: 'llm7',
            label: 'NesilAI YZ (ücretsiz — anahtar yok)',
            short: BRAND_NAME,
            brand: BRAND_NAME,
            engine: 'LLM7.io',
            kind: 'openai',
            chatUrl: 'https://api.llm7.io/v1/chat/completions',
            modelsUrl: 'https://api.llm7.io/v1/models',
            defaultModel: 'minimax-m2.7',
            suggestedModels: ['minimax-m2.7', 'codestral-latest', 'GLM-5.3-Flash', 'mistral-Nemo-Instruct-2407'],
            modelHints: {
                'minimax-m2.7': 'Genel amaçlı, uzun bağlam (180K)',
                'codestral-latest': 'Kod için optimize',
                'GLM-5.3-Flash': 'Hızlı, 400K bağlam',
                'mistral-Nemo-Instruct-2407': 'Hafif ve hızlı'
            },
            needsKey: false,
            vision: false,
            keyUrl: 'https://token.llm7.io/',
            keyHint: 'İsteğe bağlı hız anahtarı: token.llm7.io — limiti yükseltir, zorunlu değildir.',
            note: 'Anahtarsız çalışır (günlük ~1M token). Modeli aşağıdan seçebilirsin.'
        },
        pollinations: {
            id: 'pollinations',
            label: 'NesilAI YZ — otomatik yedek motor',
            short: BRAND_NAME,
            brand: BRAND_NAME,
            engine: 'Pollinations',
            kind: 'openai',
            chatUrl: 'https://text.pollinations.ai/openai',
            modelsUrl: 'https://text.pollinations.ai/models',
            defaultModel: 'openai-fast',
            suggestedModels: ['openai-fast'],
            needsKey: false,
            vision: false,
            note: 'NesilAI YZ\'nin otomatik yedeğidir; normalde Ayarlar\'dan seçilmez.'
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
                'qwen/qwen3-235b-a22b:soft',
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

    // Anahtarsız motorlar → arayüzde "NesilAI YZ" markasıyla görünür
    const FREE_PROVIDER_IDS = ['llm7', 'pollinations'];
    function isNesilAiBrand(providerId) {
        return FREE_PROVIDER_IDS.indexOf(providerId) !== -1;
    }

    const DEFAULT_SETTINGS = {
        provider: 'llm7',
        keys: {},       // { gemini: '...', groq: '...' }
        models: {},     // { llm7: 'minimax-m2.7' }
        baseUrls: {},   // { custom: 'http://localhost:11434/v1' }
        language: '',   // Yanıt dili: '' = otomatik; 'tr','ru','es','hi','de','custom:<isim>'
        uiLanguage: '', // Arayüz dili: '' = yanıtı izle; 'ru','tr','es','hi','de'
        temperature: 0.7,
        systemPrompt: ''
    };

    // İç yardımcı çağrı kimlikleri (dil direktifi uygulanmaz)
    const INTERNAL_CALLER_IDS = ['memory', 'ocr', 'prompt-enhancer', 'research-plan'];

    // ========================================================
    // Dil Seçimi — ayarlardan seçilen dil sistem istemine eklenir
    // ========================================================
    const AI_LANGUAGES = [
        { code: '', name: 'Otomatik (kullanıcının dili)', flag: '🌐' },
        { code: 'ru', name: 'Rusça', flag: '🇷🇺' },
        { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
        { code: 'es', name: 'İspanyolca', flag: '🇪🇸' },
        { code: 'hi', name: 'Hintçe', flag: '🇮🇳' },
        { code: 'de', name: 'Almanca', flag: '🇩🇪' },
        { code: 'en', name: 'İngilizce', flag: '🇬🇧' }
    ];
    const LANGUAGE_INSTRUCTIONS = {
        ru: 'her zaman Rusça yanıt ver (kullanıcı başka dilde yazsa bile)',
        tr: 'her zaman Türkçe yanıt ver (kullanıcı başka dilde yazsa bile)',
        es: 'her zaman İspanyolca yanıt ver (kullanıcı başka dilde yazsa bile)',
        hi: 'her zaman Hintçe yanıt ver (kullanıcı başka dilde yazsa bile)',
        de: 'her zaman Almanca yanıt ver (kullanıcı başka dilde yazsa bile)',
        en: 'her zaman İngilizce yanıt ver (kullanıcı başka dilde yazsa bile)'
    };

    function getLanguage() {
        return getSettings().language || '';
    }

    function buildLanguageDirective() {
        const lang = getLanguage();
        if (!lang) return ''; // Otomatik → ek direktif yok

        if (lang.indexOf('custom:') === 0) {
            const name = lang.slice(7).trim();
            if (!name) return '';
            return `Kullanıcı ayarlardan yanıt dilini "${name}" olarak seçti; ${name} dilinde yanıt ver (kullanıcı başka bir dilde yazsa bile).`;
        }
        return 'Kullanıcı ayarlardan yanıt dilini sabitledi: ' + (LANGUAGE_INSTRUCTIONS[lang] || lang + ' dilinde yanıt ver') + '.';
    }

    // ========================================================
    // Arayüz Çevirisi — Dil Seçimi yalnızca YZ yanıtını değil,
    // MENÜLERİN/DÜĞMELERİN dilini de değiştirir (Ru/Tr/Es/Hi/De).
    // Sözlük anahtarı = Türkçe kaynak dizgi; app.js t() ile kullanır.
    // ========================================================
    const UI_LANGUAGES = [
        { code: '', name: 'Otomatik (yanıt dilini izle)', flag: '🌐' },
        { code: 'ru', name: 'Rusça', flag: '🇷🇺' },
        { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
        { code: 'es', name: 'İspanyolca', flag: '🇪🇸' },
        { code: 'hi', name: 'Hintçe', flag: '🇮🇳' },
        { code: 'de', name: 'Almanca', flag: '🇩🇪' },
        { code: 'en', name: 'İngilizce', flag: '🇬🇧' }
    ];

    const UI_TRANSLATIONS = {
        ru: {
            '[yerel]': '[локально]', '[çevrimiçi]': '[онлайн]',
            "İsteğe bağlı hız anahtarı: token.llm7.io — limiti yükseltir, zorunlu değildir.": "Необязательный ключ скорости: token.llm7.io — повышает лимиты, не обязателен.",
            "Anahtarsız çalışır (günlük ~1M token). Modeli aşağıdan seçebilirsin.": "Работает без ключа (~1M токенов в день). Модель можно выбрать ниже.",
            "API anahtarı gerekmez.": "API-ключ не требуется.",
            "Görsel okuma (vision) desteklenir.": "Поддерживается распознавание изображений (vision).",
            "Google AI Studio ücretsiz katmanı: kredi kartı istemez.": "Бесплатный уровень Google AI Studio: без кредитной карты.",
            "Groq ücretsiz katmanı çok hızlıdır (LPU).": "Бесплатный уровень Groq очень быстрый (LPU).",
            "Sonu \":free\" ile biten modeller ücretsizdir.": "Модели, заканчивающиеся на \":free\", бесплатны.",
            "OpenAI ücretsiz katman sunmaz; kullanım için bakiye gerekir.": "У OpenAI нет бесплатного уровня; нужен баланс.",
            "Ollama, LM Studio, vLLM, DeepSeek, Mistral… OpenAI uyumlu her sunucu.": "Ollama, LM Studio, vLLM, DeepSeek, Mistral… любой OpenAI-совместимый сервер.",
            "Anahtarsız, ücretsiz NesilAI motoru. Gerçek modeli aşağıdan seç.": "Бесплатный движок NesilAI без ключа. Выберите модель ниже.",
            'Kaydet': 'Сохранить',
            'Örnek: Ollama': 'Например: Ollama', 'LM Studio': 'LM Studio',
            'Ayrıca sohbete': 'Также в чате', 'yazarak da açıp kapatabilirsin.': 'можно включать/выключать.',
            'Yeni sohbet': 'Новый чат', 'Kendini Tanıt': 'Представиться', 'Sohbetler': 'Чаты',
            'Bilgiler': 'Информация', 'Ücretsiz Plan': 'Бесплатный план', 'Free Plan': 'Бесплатный план',
            'Üretim havuzu': 'Галерея создания', 'Ayarlar': 'Настройки',
            'NesilAI ile çalışmaya başla': 'Начните работу с NesilAI',
            'Gerçek bir yapay zeka modeliyle sohbet et, görsel oluştur, sesini yazıya çevir ve yüklediğin görselleri okut.': 'Общайтесь с настоящей моделью ИИ, создавайте изображения, переводите голос в текст и распознавайте загруженные изображения.',
            'Aktif kaynak:': 'Активный источник:', 'Kaynağı değiştir': 'Изменить источник', 'Anahtarını ekle': 'Добавить ключ',
            'Görsel oluştur': 'Создать изображение', 'Neon ışıklı siberpunk bir şehir': 'Неоновый киберпанк-город',
            'Asistanı tanı': 'Знакомство с ассистентом', 'Neler yapabildiğini anlat': 'Что я умею',
            'Kod yaz': 'Написать код', 'JavaScript todo uygulaması': 'TODO-приложение на JavaScript',
            'Yazı üret': 'Написать текст', 'Yapay zekanın geleceği': 'Будущее искусственного интеллекта',
            'Ara': 'Поиск', 'Model ara…': 'Поиск модели…',
            'Kendi API anahtarını eklemek için Ayarlar → Yapay Zeka.': 'Чтобы добавить свой API-ключ: Настройки → ИИ.',
            'Seçtiğin mod, gönderdiğin her mesajı o türde üretir.': 'Выбранный режим определяет тип каждого сообщения.',
            'Komutu seç ya da yazmaya devam et — boşluk bırakınca talimatını ekleyebilirsin.': 'Выберите команду или продолжайте ввод — через пробел можно добавить уточнение.',
            'Görsel yükle': 'Загрузить изображение', 'Görsel yükle ve metnini okut': 'Загрузить изображение и распознать текст',
            'Sesle yaz': 'Голосовой ввод', 'Yanıtı durdur': 'Остановить ответ', 'Gönder': 'Отправить', 'Bir mesaj yaz…': 'Введите сообщение…',
            'Enter ile gönder · Shift+Enter ile satır atla · Yanıtlar hatalı olabilir, önemli bilgileri doğrula': 'Enter — отправить · Shift+Enter — новая строка · Ответы могут быть неточными, проверяйте важное',
            'Sağlayıcı ayarla': 'Настроить провайдера', 'anahtar gerekli': 'нужен ключ', '(kurulum gerekli)': '(требуется настройка)',
            'Menüyü aç/kapat': 'Открыть/закрыть меню', 'Tema değiştir': 'Сменить тему', 'Açık/koyu tema': 'Светлая/тёмная тема', 'Sesli': 'Голос',
            'Model': 'Модель', 'Sohbet': 'Чат', 'Normal yapay zeka sohbeti': 'Обычный чат с ИИ',
            'Görsel üret': 'Создать изображение', 'Yazdığın tarif görsel olur': 'Ваше описание станет изображением',
            'Müzik / Ses': 'Музыка / Звук', 'Şarkı, enstrümantal veya seslendirme': 'Песня, инструментал или озвучка',
            'aktif': 'активно',
            'Mod: {m} — yazdığın her şey {m} olarak üretilcek': 'Режим: {m} — каждое сообщение будет создано как {m}',
            'NesilAI YZ · {m} seçildi': 'NesilAI YZ · {m} выбрано', 'Ayarlar kaydedildi': 'Настройки сохранены',
            'Yapay zeka sağlayıcısı, ses ve veri seçenekleri.': 'ИИ-провайдер, голос и данные.',
            'Yapay zeka': 'Искусственный интеллект', 'Sağlayıcı': 'Провайдер', 'NesilAI YZ modeli': 'Модель NesilAI YZ',
            'Minimax, Codestral, GLM, Mistral Nemo — anahtarsız çalışır.': 'Minimax, Codestral, GLM, Mistral Nemo — без ключа.',
            'Anahtarsız çalışır; modeli istediğin an değiştirebilirsin. Değişiklik anında kaydedilir.': 'Работает без ключа; модель можно сменить в любой момент. Изменение сохраняется сразу.',
            'Listeden seçebilir ya da model adını elle yazabilirsin.': 'Выберите из списка или введите название модели вручную.',
            'API anahtarı': 'API-ключ', 'Anahtarını buraya yapıştır': 'Вставьте свой ключ сюда', 'Göster': 'Показать',
            'API anahtarı al ↗': 'Получить API-ключ ↗',
            'Anahtar yalnızca bu tarayıcının localStorage alanında tutulur, hiçbir sunucuya gönderilmez.': 'Ключ хранится только в localStorage этого браузера и не отправляется ни на какой сервер.',
            'Sunucu adresi (OpenAI uyumlu)': 'Адрес сервера (OpenAI-совместимый)',
            'Yaratıcılık (temperature) —': 'Креативность (temperature) —',
            'Düşük değer daha kesin, yüksek değer daha yaratıcı yanıt üretir.': 'Ниже — точнее, выше — креативнее.',
            'Bağlantıyı test et': 'Проверить соединение', 'Bağlantı test ediliyor...': 'Проверка соединения...',
            'Kendi anahtarını kullanmak, hesapların ve kotaların sana ait olmasını sağlar. Başkasının yayınladığı anahtarlar güvenlik ihlali olur ve çalışmaz — denemek için ücretsiz katman sunan sağlayıcıları (Gemini, Groq, OpenRouter) kullan.': 'Свой ключ означает, что аккаунты и квоты принадлежат вам. Чужие опубликованные ключи — нарушение безопасности и не работают — для проб используйте провайдеров с бесплатным уровнем (Gemini, Groq, OpenRouter).',
            'Dil Seçme': 'Выбор языка', 'Yanıt dili': 'Язык ответов',
            'Yapay zeka, seçtiğin dilde yanıt verir. "Otomatik" seçersen hangi dilde yazarsan o dilde yanıtlar.': 'ИИ будет отвечать на выбранном языке. «Автоматически» — отвечает на языке вашего сообщения.',
            'Diğer dil — kendin seç': 'Другой язык — выберите сами',
            'Listede olmayan herhangi bir dilin adını yaz; yapay zeka o dilde yanıtlar.': 'Введите название любого языка, отсутствующего в списке; ИИ будет отвечать на нём.',
            'Arayüz dili': 'Язык интерфейса',
            'Menülerin ve düğmelerin dili. "Otomatik" seçiliyse yanıt dilini izler.': 'Язык меню и кнопок. При «Автоматически» следует языку ответов.',
            'Ses': 'Голос', 'Seslendirici': 'Голос', 'Konuşma hızı —': 'Скорость речи —', 'Ses tonu —': 'Тон голоса —',
            'Bellek': 'Память', 'Kalıcı bellek açık — adın, projelerin ve tercihleriniz yeni sohbetlerde hatırlanır': 'Постоянная память включена — имя, проекты и предпочтения запоминаются в новых чатах',
            'Tüm belleği temizle': 'Очистить всю память', 'Veri': 'Данные', 'Tüm sohbet geçmişini sil': 'Удалить всю историю чатов',
            'Yanıt Stili': 'Стиль ответов', 'İnsan gibi yaz — AI-Slop\'u kapat (kalıp cümleler, boş nezaket, liste yığını yok)': 'Писать как человек — выключить AI-Slop (шаблонные фразы, пустая вежливость, списки)',
            'Görünüm': 'Вид', 'Cihaz modu': 'Режим устройства', 'Kaydet ve kapat': 'Сохранить и закрыть',
            'Sistem sesleri yükleniyor…': 'Загрузка системных голосов…',
            'Henüz kayıtlı bilgi yok. Sohbet ederken "adım Alperen" gibi kalıcı bilgiler yazarsan burada görünür.': 'Пока нет записей. Напишите в чате что-то вроде «меня зовут …» — это запомнится.',
            'Sil': 'Удалить', 'Sohbet silindi': 'Чат удалён', 'Galeri temizlendi': 'Галерея очищена',
            'Üretim havuzu: görseller hazır': 'Галерея создания: изображения готовы',
            'En azından adını yaz — gerisi isteğe bağlı': 'Напишите хотя бы имя — остальное по желанию',
            'Gizli bellek güncellendi — artık seni tanıyorum': 'Скрытая память обновлена — я вас запомнил',
            'Gizli bellek kaydedilemedi': 'Не удалось сохранить скрытую память', 'Gizli bellek temizlendi': 'Скрытая память очищена',
            'Yanıt durduruldu': 'Ответ остановлен', 'Konuşma tanıma desteklenmiyor': 'Распознавание речи не поддерживается',
            'Kayıt durduruldu': 'Запись остановлена', 'Sizi dinliyorum, konuşabilirsiniz...': 'Слушаю вас, говорите...',
            'Mikrofon izni reddedildi — adres çubuğundaki kilit/izn menüsünden izin ver': 'Доступ к микрофону отклонён — разрешите через замок/меню разрешений в адресной строке',
            'Konuşma tanıma servisine ulaşılamadı': 'Служба распознавания речи недоступна', 'Mikrofon açılamadı': 'Не удалось включить микрофон',
            'Sesli sohbet bu tarayıcıda tam desteklenmiyor': 'Голосовой чат полностью не поддерживается этим браузером',
            'Lütfen bir resim dosyası seçin': 'Выберите файл изображения', 'Görsel başarıyla analiz edildi': 'Изображение успешно проанализировано',
            'Seslendirme başlatılamadı': 'Не удалось начать озвучку', 'Mikrofon hatası: {c}': 'Ошибка микрофона: {c}',
            'Derin düşünür, detaylı araştırıp yanıtlar': 'Глубоко размышляет, подробно исследует и отвечает',
            'İnternette derin araştırma yapıp rapor hazırlar': 'Глубоко исследует в интернете и готовит отчёт',
            'Araştırır, plan çıkarır, kod yazar': 'Исследует, составляет план, пишет код',
            'Kodlama ajanı — dosyaları okur, yazar, oluşturur, siler (on/off)': 'Агент кодинга — читает, пишет, создаёт, удаляет файлы (on/off)',
            'Ekranını canlı izlet — PC ekran asistanı (on/off/settings)': 'Показ экрана в реальном времени — ассистент экрана ПК (on/off/settings)',
            'AI-Slop\'u kapat — insan gibi konuşur (on/off)': 'Выключить AI-Slop — говорит как человек (on/off)',
            'Ayarlar panelini açar (sağlayıcı, model, ses, veri)': 'Открывает панель настроек (провайдер, модель, голос, данные)',
            'Açık/koyu temayı değiştirir': 'Переключает светлую/тёмную тему', 'Sesli sohbet modunu açar': 'Открывает голосовой режим чата',
            'Tüm sohbet geçmişini siler': 'Удаляет всю историю чатов', 'Tüm komutları listeler': 'Список всех команд',
            'Tüm komutları listeler (/yardim ile aynı)': 'Список всех команд (то же, что /yardim)',
            'Komutlar: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim': 'Команды: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim',
            'Yanıt verirken internette araştırma yap': 'Искать в интернете при ответе',
            'NesilAI YZ modelini değiştir': 'Сменить модель NesilAI YZ', 'Üretim modu seç': 'Выбрать режим создания',
            'Ücretsiz hız anahtarı (isteğe bağlı)': 'Бесплатный ключ скорости (необязательно)',
            'Ücretsiz hız anahtarı al ↗': 'Получить бесплатный ключ ↗',
            'İsteğe bağlı: alırsan hız limitin yükselir; anahtarsız da çalışır.': 'Необязательно: с ключом выше лимиты; работает и без ключа.',
            'Anahtar eklendi — limitin yükseltildi': 'Ключ добавлен — лимиты повышены',
            'NesilAI YZ yoğun — otomatik yedek motora geçildi': 'NesilAI YZ перегружен — выполнен переход на резервный двигатель',
            'Uygulamayı indir': 'Скачать приложение', 'Android uygulaması': 'Приложение для Android', 'Bilgisayar uygulaması': 'Приложение для ПК',
            'Kapat': 'Закрыть', 'Eki kaldır': 'Убрать вложение', 'Mesaj': 'Сообщение', 'Kenar çubuğu': 'Боковая панель',
            'Kitaplık': 'Библиотека', 'Üretilen tüm görsel, müzik ve videolar burada birikir.': 'Все созданные изображения, музыка и видео собираются здесь.', 'Tümü': 'Все', 'Görseller': 'Изображения', 'Müzik & Ses': 'Музыка и звук', 'Videolar': 'Видео', 'Üretim bilgisi': 'Информация о создании', 'Motor': 'Движок', 'Tarih': 'Дата', 'Prompt': 'Промпт', 'İndir': 'Скачать', 'Ön izle': 'Просмотр', 'Görsel': 'Изображение', 'Müzik': 'Музыка', 'Video': 'Видео', 'Müzik/Ses': 'Музыка/Звук', 'Dinle': 'Слушать', 'Kopyala': 'Копировать', 'Kitaplık yükleniyor…': 'Библиотека загружается…', 'Kitaplık henüz boş. Sohbette ya da Üretim havuzunda görsel, müzik veya video üret; hepsi burada birikecek.': 'Библиотека пока пуста. Создайте изображение, музыку или видео в чате или в галерее создания — всё соберётся здесь.', 'Prompt ve motor bilgisi': 'Информация о промпте и движке', 'Bilgi: prompt ve motor': 'Инфо: промпт и движок', 'Kitaplık görseli': 'Изображение библиотеки',
            'Model seç': 'Выбрать модель', 'Komut seç': 'Выбрать команду', 'Kaydı başlat/durdur': 'Старт/стоп записи',
            'Mikrofonu aç/kapat': 'Вкл/выкл микрофон', 'Sohbeti bitir': 'Завершить чат', 'NesilAI logosu': 'Логотип NesilAI',
            'Kendini tanıt': 'Представьтесь', 'NesilAI Bilgileri': 'О NesilAI', 'Sesli sohbet': 'Голосовой чат',
            'Yapay zeka motoru, gizlilik ve kullanım kılavuzu — hepsi burada.': 'Движок ИИ, приватность и руководство — всё здесь.',
            'NesilAI nedir?': 'Что такое NesilAI?', 'Gizlilik: verileriniz nerede?': 'Приватность: где ваши данные?',
            'Yapay zeka motoru': 'Движок ИИ', 'Kullanım kılavuzu': 'Руководство', 'Sosyal medya': 'Соцсети', 'Üç ilke': 'Три принципа', 'Gizlilik & Güvenlik': 'Приватность и безопасность', 'Kullanıcı Sözleşmesi': 'Пользовательское соглашение',
            "Instagram'da takip et": 'Следите в Instagram', 'Tarafından Bloodline INC.': 'От Bloodline INC.',
            'Yapay zeka sohbetinden bağımsız üretim atölyesi — üret, dinle, indir.': 'Мастерская создания независимо от чата с ИИ — создавайте, слушайте, скачивайте.',
            'NesilAI, Bloodline üzerinde çalışan bir yapay zeka asistanıdır; Acsida tarafından geliştirilmiştir. Sohbet, görsel üretimi, ses↔yazı ve': 'NesilAI — ИИ-ассистент на Bloodline; разработан Acsida. Чат, создание изображений, голос↔текст и',
            'ekran asistanı gibi yetenekleri vardır. OpenView yalnızca bilgisayar uygulamasında ayrı bir pencere olarak çalışır; web sürümünde ayrı bir PiP penceresi açar.': 'ассистент экрана OpenView. OpenView работает только в приложении для ПК отдельным окном; в веб-версии открывает отдельное окно PiP.',
            'Loglar ve sohbetler': 'Логи и чаты', 'tarayıcınızın': 'находятся в',
            "'nda tutulur — sunucuya gönderilmez.": '— и не отправляются на сервер.',
            '(Kendini Tanıt bilgileri) cihazınızda şifrelenmiş alan adında tutulur; hiçbir arayüzde gösterilmez.': '(данные «Представьтесь») хранятся на устройстве в зашифрованном виде; нигде не отображаются.',
            'OpenView ekran görüntüleri': 'Скриншоты OpenView',
            'yalnızca sorduğunuz anda alınır, yanıt verdikten sonra atılır; kalıcı saklanmaz.': 'делаются только в момент запроса и удаляются после ответа; не сохраняются.',
            'Üretim görselleri/müzik/videolar': 'Созданные изображения/музыка/видео',
            "IndexedDB'de saklanır; sohbeti silmek bunları da silmez.": 'хранятся в IndexedDB; удаление чата их не удаляет.',
            'Sohbet: ücretsiz, anahtarsız NesilAI YZ — limitte otomatik yedek motora geçer.': 'Чат: бесплатный NesilAI YZ без ключа — при лимите автоматически переключается на резервный двигатель.',
            "Görsel: Pollinations + AI Horde (bağımsız yedek) — Türkçe promptlar otomatik İngilizce'ye çevrilir.": 'Изображения: Pollinations + AI Horde (независимый резерв) — турецкие промпты автоматически переводятся на английский.',
            'Ses: Web Speech API; çalışmazsa cihazınızda çalışan yerel Whisper modeli devreye girer.': 'Голос: Web Speech API; если не работает, включается локальный Whisper на устройстве.',
            '(ekran asistanı), ': '(ассистент экрана), ', '(insan gibi yazma), ': '(писать как человек), ',
            'yeni sohbette adını, yaşını, ilgi alanlarını yaz — AI artık sana özel konuşur (gizli belleğe yazılır).': 'в новом чате напишите имя, возраст, интересы — ИИ будет говорить персонально (записывается в скрытую память).',
            'mesaj kutusuna ne istediğini yaz; "görsel oluştur" gibi ifadeler otomatik görsel moduna geçer.': 'напишите в поле сообщения, что хотите; фразы вроде «создать изображение» переключают в режим изображений.',
            'birden çok görseli/müziği tek seferde üret, sonuçları galeriden yönet.': 'создавайте несколько изображений/музыки за раз, управляйте результатами в галерее.',
            'OpenView için': 'для OpenView', "(Ayarlar'dan değiştirilebilir).": '(можно изменить в Настройках).',
            'Otomatik (ekran genişliğine göre)': 'Автоматически (по ширине экрана)',
            'Telefon — kompakt tek kolon, büyük dokunma hedefleri': 'Телефон — компактная колонка, крупные кнопки',
            'Masaüstü — tam arayüz': 'ПК — полный интерфейс',
            'Telefon modunda renkler, yazı boyutları ve dokunma alanları tamamen telefona göre ayarlanır; hangi ekranda olursan ol telefon düzeninde kalır.': 'В телефонном режиме цвета, размеры шрифта и кнопки настроены под телефон; на любом экране сохраняется телефонный вид.',
            'NesilAI YZ (ücretsiz — anahtar yok)': 'NesilAI YZ (бесплатно — без ключа)',
            'Google Gemini (AI Studio anahtarı)': 'Google Gemini (ключ AI Studio)',
            'Groq Cloud (ücretsiz kota)': 'Groq Cloud (бесплатная квота)',
            'OpenRouter (ücretsiz modeller var)': 'OpenRouter (есть бесплатные модели)',
            'OpenAI (kendi anahtarınla)': 'OpenAI (свой ключ)',
            'Özel uç nokta (OpenAI uyumlu)': 'Свой сервер (OpenAI-совместимый)',
            'Otomatik (kullanıcının dili)': 'Автоматически (язык пользователя)',
            'Rusça': 'Русский', 'Türkçe': 'Турецкий', 'İspanyolca': 'Испанский', 'Hintçe': 'Хинди', 'Almanca': 'Немецкий', 'İngilizce': 'Английский',
            'Otomatik (yanıt dilini izle)': 'Автоматически (как язык ответов)',
            '✏️ Diğer dili kendin seç…': '✏️ Другой язык — свой вариант…',
            'Genel amaçlı, uzun bağlam (180K)': 'Универсальная, длинный контекст (180K)',
            'Kod için optimize': 'Оптимизирована для кода', 'Hızlı, 400K bağlam': 'Быстрая, контекст 400K', 'Hafif ve hızlı': 'Лёгкая и быстрая',
            'Yanıt yazılıyor': 'Пишем ответ', 'İnternette araştırılıyor': 'Ищем в интернете', 'Mimari plan çıkarılıyor': 'Составляем план', 'çalışıyor': 'выполняется',
            'Yapay zekadan yanıt alınamadı.': 'Не удалось получить ответ от ИИ.', 'Bilinmeyen hata': 'Неизвестная ошибка',
            'Yapay zekadan yanıt alınamadı': 'Не удалось получить ответ от ИИ', 'Yapay zeka kaynağı yeniden ayarlanmalı': 'Требуется перенастроить источник ИИ',
            'Ayarlar → Yapay Zeka bölümünden bir sağlayıcı seçip anahtarını ekle, ardından ': 'В Настройках → ИИ выберите провайдера, добавьте ключ, затем ',
            ' butonunu kullan.': 'нажмите проверку.',
            'Anahtar geçersiz görünüyor. Ayarlar → Yapay Zeka bölümünden güncelleyip ': 'Ключ выглядит недействительным. Обновите его в Настройках → ИИ и проверьте через ',
            ' ile doğrula.': '.',
            'Aktif sağlayıcı: ': 'Активный провайдер: ',
            '. Ayarlar → Yapay Zeka bölümünden başka bir sağlayıcı ya da model seçmeyi dene.': '. В Настройках → ИИ попробуйте другого провайдера или модель.',
            'Bağlantını kontrol edip tekrar dene. Ağ engelleyicin isteği durduruyor olabilir.': 'Проверьте соединение и повторите. Возможно, запрос блокирует сеть/блокировщик.',
            'Tekrar deneyebilir ya da Ayarlar → Yapay Zeka bölümünden ': 'Повторите попытку или выберите в Настройках → ИИ для ',
            ' için farklı bir model seçebilirsin.': ' другую модель.',
            'Bu isimde komut yok — yazmaya devam et, normal mesaj olarak gönderilir.': 'Такой команды нет — продолжайте вводить, отправится как обычное сообщение.',
            '{n} kayıtlı bilgi · cihazında saklanıyor': '{n} записей · хранится на устройстве',
            '{n} ses kullanılabilir ({k} Türkçe) — tüm diller listelenir; tarayıcının desteklediği sesler cihazına göre değişir.': '{n} голосов доступно ({k} турецких) — список полный; доступные голоса зависят от браузера и устройства.',
            'Yanıtları otomatik olarak seslendir': 'Автоматически озвучивать ответы',
            'Bildirim sesleri — yanıt gelince iMessage tarzı çal': 'Звуки уведомлений — стиль iMessage при ответе',
            'Göster': 'Показать', 'Gizle': 'Скрыть',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler (on/off)': 'Режим честности — без похвалы; если идея не выгорит, скажет прямо (вкл/выкл)',
            'Dürüstlük modu açık. Bundan sonra süsleme yok: fikir kötüyse "tutmaz" derim, riskleri baştan söylerim, yapılabileceğini sanmıyorsam açıkça söylerim. Övgü yerine gerçek değerlendirim olur.': 'Режим честности включён. Без прикрас: если идея плохая, скажу «не взлетит», сразу назову риски; если что-то не получится — скажу прямо. Вместо похвалы — реальная оценка.',
            'Dürüstlük modu kapandı. Standart asistan tonuna döndüm.': 'Режим честности выключен. Возвращаюсь к стандартному тону.',
            'ACSMOD açık (geliştirici modu). Gereksiz uyarı ve moral dersi yok; teknik konuları doğrudan anlatırım. Yasadışı ya da zarar verici işler yine olmaz — o kısımları reddederim.': 'ACSMOD включён (режим разработчика). Без лишних предупреждений и нравоучений; технические темы объясняю прямо. Незаконное или вредоносное по-прежнему отклоняю.',
            'ACSMOD kapandı. Standart tona döndüm.': 'ACSMOD выключен. Возвращаюсь к стандартному тону.',
            'Motor sağlık testi çalışıyor…': 'Проверка работоспособности движков…',
            'Sohbet motoru: ÇALIŞIYOR': 'Чат-движок: РАБОТАЕТ',
            'Sohbet motoru: HATA': 'Чат-движок: ОШИБКА',
            'Görsel motoru: ÇALIŞIYOR': 'Графический движок: РАБОТАЕТ',
            'Görsel motoru: HATA': 'Графический движок: ОШИБКА',
            'zaman aşımı': 'тайм-аут',
            'bilinmeyen hata': 'неизвестная ошибка',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler, riskleri gizlemez': 'Режим честности — без похвалы; говорит прямо, если идея не выгорит, и не скрывает риски'
        },

        es: {
            '[yerel]': '[local]', '[çevrimiçi]': '[en línea]',
            "İsteğe bağlı hız anahtarı: token.llm7.io — limiti yükseltir, zorunlu değildir.": "Clave de velocidad opcional: token.llm7.io — amplía límites, no obligatoria.",
            "Anahtarsız çalışır (günlük ~1M token). Modeli aşağıdan seçebilirsin.": "Funciona sin clave (~1M tokens al día). Puedes elegir el modelo abajo.",
            "API anahtarı gerekmez.": "No se requiere clave API.",
            "Görsel okuma (vision) desteklenir.": "Soporta lectura de imágenes (vision).",
            "Google AI Studio ücretsiz katmanı: kredi kartı istemez.": "Nivel gratuito de Google AI Studio: sin tarjeta de crédito.",
            "Groq ücretsiz katmanı çok hızlıdır (LPU).": "El nivel gratuito de Groq es muy rápido (LPU).",
            "Sonu \":free\" ile biten modeller ücretsizdir.": "Los modelos que terminan en \":free\" son gratuitos.",
            "OpenAI ücretsiz katman sunmaz; kullanım için bakiye gerekir.": "OpenAI no ofrece nivel gratuito; se necesita saldo.",
            "Ollama, LM Studio, vLLM, DeepSeek, Mistral… OpenAI uyumlu her sunucu.": "Ollama, LM Studio, vLLM, DeepSeek, Mistral… cualquier servidor compatible con OpenAI.",
            "Anahtarsız, ücretsiz NesilAI motoru. Gerçek modeli aşağıdan seç.": "Motor NesilAI gratuito sin clave. Elige el modelo abajo.",
            'Kaydet': 'Guardar',
            'Örnek: Ollama': 'Ejemplo: Ollama', 'LM Studio': 'LM Studio',
            'Ayrıca sohbete': 'También en el chat', 'yazarak da açıp kapatabilirsin.': 'puedes activarlo o desactivarlo.',
            'Yeni sohbet': 'Nuevo chat', 'Kendini Tanıt': 'Preséntate', 'Sohbetler': 'Chats',
            'Bilgiler': 'Información', 'Ücretsiz Plan': 'Plan gratis', 'Free Plan': 'Plan gratis',
            'Üretim havuzu': 'Galería de creación', 'Ayarlar': 'Ajustes',
            'NesilAI ile çalışmaya başla': 'Empieza a trabajar con NesilAI',
            'Gerçek bir yapay zeka modeliyle sohbet et, görsel oluştur, sesini yazıya çevir ve yüklediğin görselleri okut.': 'Chatea con un modelo de IA real, crea imágenes, convierte tu voz en texto y lee las imágenes que subas.',
            'Aktif kaynak:': 'Fuente activa:', 'Kaynağı değiştir': 'Cambiar fuente', 'Anahtarını ekle': 'Añadir clave',
            'Görsel oluştur': 'Crear imagen', 'Neon ışıklı siberpunk bir şehir': 'Una ciudad cyberpunk con luces de neón',
            'Asistanı tanı': 'Conocer al asistente', 'Neler yapabildiğini anlat': 'Qué sabe hacer',
            'Kod yaz': 'Escribir código', 'JavaScript todo uygulaması': 'App de tareas en JavaScript',
            'Yazı üret': 'Escribir un texto', 'Yapay zekanın geleceği': 'El futuro de la IA',
            'Ara': 'Buscar', 'Model ara…': 'Buscar modelo…',
            'Kendi API anahtarını eklemek için Ayarlar → Yapay Zeka.': 'Para añadir tu clave API: Ajustes → IA.',
            'Seçtiğin mod, gönderdiğin her mesajı o türde üretir.': 'El modo elegido define el tipo de cada mensaje que envíes.',
            'Komutu seç ya da yazmaya devam et — boşluk bırakınca talimatını ekleyebilirsin.': 'Elige un comando o sigue escribiendo — añade un espacio para tus instrucciones.',
            'Görsel yükle': 'Subir imagen', 'Görsel yükle ve metnini okut': 'Subir imagen y leer su texto',
            'Sesle yaz': 'Dictar por voz', 'Yanıtı durdur': 'Detener respuesta', 'Gönder': 'Enviar', 'Bir mesaj yaz…': 'Escribe un mensaje…',
            'Enter ile gönder · Shift+Enter ile satır atla · Yanıtlar hatalı olabilir, önemli bilgileri doğrula': 'Enter envía · Shift+Enter salto de línea · Las respuestas pueden ser erróneas, verifica lo importante',
            'Sağlayıcı ayarla': 'Configurar proveedor', 'anahtar gerekli': 'falta clave', '(kurulum gerekli)': '(configuración pendiente)',
            'Menüyü aç/kapat': 'Abrir/cerrar menú', 'Tema değiştir': 'Cambiar tema', 'Açık/koyu tema': 'Tema claro/oscuro', 'Sesli': 'Voz',
            'Model': 'Modelo', 'Sohbet': 'Chat', 'Normal yapay zeka sohbeti': 'Chat normal con la IA',
            'Görsel üret': 'Crear imagen', 'Yazdığın tarif görsel olur': 'Tu descripción se convierte en imagen',
            'Müzik / Ses': 'Música / Sonido', 'Şarkı, enstrümantal veya seslendirme': 'Canción, instrumental o locución',
            'aktif': 'activo',
            'Mod: {m} — yazdığın her şey {m} olarak üretilcek': 'Modo: {m} — todo lo que escribas se generará como {m}',
            'NesilAI YZ · {m} seçildi': 'NesilAI YZ · {m} seleccionado', 'Ayarlar kaydedildi': 'Ajustes guardados',
            'Yapay zeka sağlayıcısı, ses ve veri seçenekleri.': 'Proveedor de IA, voz y datos.',
            'Yapay zeka': 'Inteligencia artificial', 'Sağlayıcı': 'Proveedor', 'NesilAI YZ modeli': 'Modelo de NesilAI YZ',
            'Minimax, Codestral, GLM, Mistral Nemo — anahtarsız çalışır.': 'Minimax, Codestral, GLM, Mistral Nemo — sin clave.',
            'Anahtarsız çalışır; modeli istediğin an değiştirebilirsin. Değişiklik anında kaydedilir.': 'Funciona sin clave; puedes cambiar el modelo cuando quieras. Se guarda al instante.',
            'Listeden seçebilir ya da model adını elle yazabilirsin.': 'Elige de la lista o escribe el nombre del modelo manualmente.',
            'API anahtarı': 'Clave API', 'Anahtarını buraya yapıştır': 'Pega tu clave aquí', 'Göster': 'Mostrar',
            'API anahtarı al ↗': 'Obtener clave API ↗',
            'Anahtar yalnızca bu tarayıcının localStorage alanında tutulur, hiçbir sunucuya gönderilmez.': 'La clave se guarda solo en el localStorage de este navegador; no se envía a ningún servidor.',
            'Sunucu adresi (OpenAI uyumlu)': 'Dirección del servidor (compatible con OpenAI)',
            'Yaratıcılık (temperature) —': 'Creatividad (temperature) —',
            'Düşük değer daha kesin, yüksek değer daha yaratıcı yanıt üretir.': 'Valor bajo: más preciso; valor alto: más creativo.',
            'Bağlantıyı test et': 'Probar conexión', 'Bağlantı test ediliyor...': 'Probando conexión...',
            'Kendi anahtarını kullanmak, hesapların ve kotaların sana ait olmasını sağlar. Başkasının yayınladığı anahtarlar güvenlik ihlali olur ve çalışmaz — denemek için ücretsiz katman sunan sağlayıcıları (Gemini, Groq, OpenRouter) kullan.': 'Usar tu propia clave garantiza que las cuentas y cuotas sean tuyas. Las claves publicadas por otros son una brecha de seguridad y no funcionan — para probar usa proveedores con capa gratuita (Gemini, Groq, OpenRouter).',
            'Dil Seçme': 'Selección de idioma', 'Yanıt dili': 'Idioma de respuesta',
            'Yapay zeka, seçtiğin dilde yanıt verir. "Otomatik" seçersen hangi dilde yazarsan o dilde yanıtlar.': 'La IA responderá en el idioma elegido. Con «Automático» responde en el idioma en que escribas.',
            'Diğer dil — kendin seç': 'Otro idioma — elígelo tú',
            'Listede olmayan herhangi bir dilin adını yaz; yapay zeka o dilde yanıtlar.': 'Escribe el nombre de cualquier idioma que no esté en la lista; la IA responderá en ese idioma.',
            'Arayüz dili': 'Idioma de la interfaz',
            'Menülerin ve düğmelerin dili. "Otomatik" seçiliyse yanıt dilini izler.': 'Idioma de menús y botones. En «Automático» sigue al idioma de respuesta.',
            'Ses': 'Voz', 'Seslendirici': 'Voz', 'Konuşma hızı —': 'Velocidad de habla —', 'Ses tonu —': 'Tono de voz —',
            'Bellek': 'Memoria', 'Kalıcı bellek açık — adın, projelerin ve tercihleriniz yeni sohbetlerde hatırlanır': 'Memoria persistente activada — tu nombre, proyectos y preferencias se recuerdan en nuevos chats',
            'Tüm belleği temizle': 'Borrar toda la memoria', 'Veri': 'Datos', 'Tüm sohbet geçmişini sil': 'Borrar todo el historial de chats',
            'Yanıt Stili': 'Estilo de respuesta', 'İnsan gibi yaz — AI-Slop\'u kapat (kalıp cümleler, boş nezaket, liste yığını yok)': 'Escribir como humano — desactiva AI-Slop (frases hechas, cortesía vacía, listas)',
            'Görünüm': 'Apariencia', 'Cihaz modu': 'Modo de dispositivo', 'Kaydet ve kapat': 'Guardar y cerrar',
            'Sistem sesleri yükleniyor…': 'Cargando voces del sistema…',
            'Henüz kayıtlı bilgi yok. Sohbet ederken "adım Alperen" gibi kalıcı bilgiler yazarsan burada görünür.': 'Aún no hay datos guardados. Escribe en el chat «me llamo …» y lo recordaré.',
            'Sil': 'Eliminar', 'Sohbet silindi': 'Chat eliminado', 'Galeri temizlendi': 'Galería limpiada',
            'Üretim havuzu: görseller hazır': 'Galería de creación: imágenes listas',
            'En azından adını yaz — gerisi isteğe bağlı': 'Escribe al menos tu nombre — lo demás es opcional',
            'Gizli bellek güncellendi — artık seni tanıyorum': 'Memoria oculta actualizada — ya te conozco',
            'Gizli bellek kaydedilemedi': 'No se pudo guardar la memoria oculta', 'Gizli bellek temizlendi': 'Memoria oculta limpiada',
            'Yanıt durduruldu': 'Respuesta detenida', 'Konuşma tanıma desteklenmiyor': 'Reconocimiento de voz no compatible',
            'Kayıt durduruldu': 'Grabación detenida', 'Sizi dinliyorum, konuşabilirsiniz...': 'Te escucho, puedes hablar...',
            'Mikrofon izni reddedildi — adres çubuğundaki kilit/izn menüsünden izin ver': 'Permiso de micrófono denegado — concédelo desde el candado/menú de permisos de la barra de direcciones',
            'Konuşma tanıma servisine ulaşılamadı': 'No se pudo acceder al servicio de reconocimiento de voz', 'Mikrofon açılamadı': 'No se pudo activar el micrófono',
            'Sesli sohbet bu tarayıcıda tam desteklenmiyor': 'El chat por voz no está totalmente soportado en este navegador',
            'Lütfen bir resim dosyası seçin': 'Selecciona un archivo de imagen', 'Görsel başarıyla analiz edildi': 'Imagen analizada con éxito',
            'Seslendirme başlatılamadı': 'No se pudo iniciar la locución', 'Mikrofon hatası: {c}': 'Error de micrófono: {c}',
            'Derin düşünür, detaylı araştırıp yanıtlar': 'Piensa a fondo, investiga a detalle y responde',
            'İnternette derin araştırma yapıp rapor hazırlar': 'Investiga a fondo en internet y prepara un informe',
            'Araştırır, plan çıkarır, kod yazar': 'Investiga, planifica y escribe código',
            'Kodlama ajanı — dosyaları okur, yazar, oluşturur, siler (on/off)': 'Agente de código — lee, escribe, crea y borra archivos (on/off)',
            'Ekranını canlı izlet — PC ekran asistanı (on/off/settings)': 'Comparte tu pantalla en vivo — asistente de pantalla de PC (on/off/settings)',
            'AI-Slop\'u kapat — insan gibi konuşur (on/off)': 'Desactiva AI-Slop — habla como humano (on/off)',
            'Ayarlar panelini açar (sağlayıcı, model, ses, veri)': 'Abre el panel de ajustes (proveedor, modelo, voz, datos)',
            'Açık/koyu temayı değiştirir': 'Cambia el tema claro/oscuro', 'Sesli sohbet modunu açar': 'Abre el modo de chat por voz',
            'Tüm sohbet geçmişini siler': 'Borra todo el historial de chats', 'Tüm komutları listeler': 'Lista todos los comandos',
            'Tüm komutları listeler (/yardim ile aynı)': 'Lista todos los comandos (igual que /yardim)',
            'Komutlar: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim': 'Comandos: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim',
            'Yanıt verirken internette araştırma yap': 'Buscar en internet al responder',
            'NesilAI YZ modelini değiştir': 'Cambiar el modelo de NesilAI YZ', 'Üretim modu seç': 'Elegir modo de creación',
            'Ücretsiz hız anahtarı (isteğe bağlı)': 'Clave de velocidad gratuita (opcional)',
            'Ücretsiz hız anahtarı al ↗': 'Obtener clave gratuita ↗',
            'İsteğe bağlı: alırsan hız limitin yükselir; anahtarsız da çalışır.': 'Opcional: con clave hay más límite; funciona sin ella.',
            'Anahtar eklendi — limitin yükseltildi': 'Clave añadida — límites ampliados',
            'NesilAI YZ yoğun — otomatik yedek motora geçildi': 'NesilAI YZ saturado — cambiado al motor de reserva',
            'Uygulamayı indir': 'Descargar la app', 'Android uygulaması': 'Aplicación Android', 'Bilgisayar uygulaması': 'Aplicación de PC',
            'Kapat': 'Cerrar', 'Eki kaldır': 'Quitar adjunto', 'Mesaj': 'Mensaje', 'Kenar çubuğu': 'Barra lateral',
            'Kitaplık': 'Biblioteca', 'Üretilen tüm görsel, müzik ve videolar burada birikir.': 'Todas las imágenes, músicas y vídeos creados se acumulan aquí.', 'Tümü': 'Todo', 'Görseller': 'Imágenes', 'Müzik & Ses': 'Música y sonido', 'Videolar': 'Vídeos', 'Üretim bilgisi': 'Información de creación', 'Motor': 'Motor', 'Tarih': 'Fecha', 'Prompt': 'Prompt', 'İndir': 'Descargar', 'Ön izle': 'Vista previa', 'Görsel': 'Imagen', 'Müzik': 'Música', 'Video': 'Vídeo', 'Müzik/Ses': 'Música/Sonido', 'Dinle': 'Escuchar', 'Kopyala': 'Copiar', 'Kitaplık yükleniyor…': 'Cargando biblioteca…', 'Kitaplık henüz boş. Sohbette ya da Üretim havuzunda görsel, müzik veya video üret; hepsi burada birikecek.': 'La biblioteca aún está vacía. Crea una imagen, música o vídeo en el chat o en la galería de creación; todo se acumulará aquí.', 'Prompt ve motor bilgisi': 'Información de prompt y motor', 'Bilgi: prompt ve motor': 'Info: prompt y motor', 'Kitaplık görseli': 'Imagen de la biblioteca',
            'Model seç': 'Elegir modelo', 'Komut seç': 'Elegir comando', 'Kaydı başlat/durdur': 'Iniciar/detener grabación',
            'Mikrofonu aç/kapat': 'Activar/silenciar micrófono', 'Sohbeti bitir': 'Terminar el chat', 'NesilAI logosu': 'Logo de NesilAI',
            'Kendini tanıt': 'Preséntate', 'NesilAI Bilgileri': 'Acerca de NesilAI', 'Sesli sohbet': 'Chat de voz',
            'Yapay zeka motoru, gizlilik ve kullanım kılavuzu — hepsi burada.': 'Motor de IA, privacidad y guía de uso — todo aquí.',
            'NesilAI nedir?': '¿Qué es NesilAI?', 'Gizlilik: verileriniz nerede?': 'Privacidad: ¿dónde están tus datos?',
            'Yapay zeka motoru': 'Motor de IA', 'Kullanım kılavuzu': 'Guía de uso', 'Sosyal medya': 'Redes sociales', 'Üç ilke': 'Tres principios', 'Gizlilik & Güvenlik': 'Privacidad y seguridad', 'Kullanıcı Sözleşmesi': 'Acuerdo de usuario',
            "Instagram'da takip et": 'Síguenos en Instagram', 'Tarafından Bloodline INC.': 'Por Bloodline INC.',
            'Yapay zeka sohbetinden bağımsız üretim atölyesi — üret, dinle, indir.': 'Taller de creación independiente del chat de IA — crea, escucha, descarga.',
            'NesilAI, Bloodline üzerinde çalışan bir yapay zeka asistanıdır; Acsida tarafından geliştirilmiştir. Sohbet, görsel üretimi, ses↔yazı ve': 'NesilAI es un asistente de IA que funciona en Bloodline; desarrollado por Acsida. Chat, creación de imágenes, voz↔texto y',
            'ekran asistanı gibi yetenekleri vardır. OpenView yalnızca bilgisayar uygulamasında ayrı bir pencere olarak çalışır; web sürümünde ayrı bir PiP penceresi açar.': 'el asistente de pantalla OpenView. OpenView funciona solo en la app de PC como ventana aparte; en la web abre una ventana PiP.',
            'Loglar ve sohbetler': 'Registros y chats', "'nda tutulur — sunucuya gönderilmez.": '— no se envían a ningún servidor.',
            '(Kendini Tanıt bilgileri) cihazınızda şifrelenmiş alan adında tutulur; hiçbir arayüzde gösterilmez.': '(datos de Preséntate) se guardan cifrados en tu dispositivo; no se muestran en ninguna interfaz.',
            'OpenView ekran görüntüleri': 'Capturas de OpenView',
            'yalnızca sorduğunuz anda alınır, yanıt verdikten sonra atılır; kalıcı saklanmaz.': 'se toman solo al preguntar y se descartan tras responder; no se guardan.',
            'Üretim görselleri/müzik/videolar': 'Imágenes/música/vídeos creados',
            "IndexedDB'de saklanır; sohbeti silmek bunları da silmez.": 'se guardan en IndexedDB; borrar el chat no los elimina.',
            'Sohbet: ücretsiz, anahtarsız NesilAI YZ — limitte otomatik yedek motora geçer.': 'Chat: NesilAI YZ gratuito sin clave — al llegar al límite cambia al motor de reserva.',
            "Görsel: Pollinations + AI Horde (bağımsız yedek) — Türkçe promptlar otomatik İngilizce'ye çevrilir.": 'Imágenes: Pollinations + AI Horde (reserva independiente) — los prompts en turco se traducen al inglés automáticamente.',
            'Ses: Web Speech API; çalışmazsa cihazınızda çalışan yerel Whisper modeli devreye girer.': 'Voz: Web Speech API; si falla, se usa el modelo Whisper local del dispositivo.',
            '(ekran asistanı), ': '(asistente de pantalla), ', '(insan gibi yazma), ': '(escribir como humano), ',
            'yeni sohbette adını, yaşını, ilgi alanlarını yaz — AI artık sana özel konuşur (gizli belleğe yazılır).': 'en un chat nuevo escribe tu nombre, edad e intereses — la IA hablará de forma personal (se guarda en memoria oculta).',
            'mesaj kutusuna ne istediğini yaz; "görsel oluştur" gibi ifadeler otomatik görsel moduna geçer.': 'escribe en el cuadro de mensaje lo que quieras; frases como «crear imagen» cambian al modo de imágenes.',
            'birden çok görseli/müziği tek seferde üret, sonuçları galeriden yönet.': 'crea varias imágenes/canciones a la vez y gestiona los resultados en la galería.',
            'OpenView için': 'para OpenView', "(Ayarlar'dan değiştirilebilir).": '(se puede cambiar en Ajustes).',
            'Otomatik (ekran genişliğine göre)': 'Automático (según el ancho de pantalla)',
            'Telefon — kompakt tek kolon, büyük dokunma hedefleri': 'Teléfono — columna compacta, botones grandes',
            'Masaüstü — tam arayüz': 'PC — interfaz completa',
            'Telefon modunda renkler, yazı boyutları ve dokunma alanları tamamen telefona göre ayarlanır; hangi ekranda olursan ol telefon düzeninde kalır.': 'En modo teléfono los colores, tamaños y botones se ajustan al teléfono; se mantiene el diseño móvil en cualquier pantalla.',
            'NesilAI YZ (ücretsiz — anahtar yok)': 'NesilAI YZ (gratis — sin clave)',
            'Google Gemini (AI Studio anahtarı)': 'Google Gemini (clave de AI Studio)',
            'Groq Cloud (ücretsiz kota)': 'Groq Cloud (cuota gratuita)',
            'OpenRouter (ücretsiz modeller var)': 'OpenRouter (hay modelos gratis)',
            'OpenAI (kendi anahtarınla)': 'OpenAI (tu propia clave)',
            'Özel uç nokta (OpenAI uyumlu)': 'Servidor propio (compatible con OpenAI)',
            'Otomatik (kullanıcının dili)': 'Automático (idioma del usuario)',
            'Rusça': 'Ruso', 'Türkçe': 'Turco', 'İspanyolca': 'Español', 'Hintçe': 'Hindi', 'Almanca': 'Alemán', 'İngilizce': 'Inglés',
            'Otomatik (yanıt dilini izle)': 'Automático (según idioma de respuesta)',
            '✏️ Diğer dili kendin seç…': '✏️ Otro idioma — a tu elección…',
            'Genel amaçlı, uzun bağlam (180K)': 'Propósito general, contexto largo (180K)',
            'Kod için optimize': 'Optimizado para código', 'Hızlı, 400K bağlam': 'Rápida, contexto 400K', 'Hafif ve hızlı': 'Ligera y rápida',
            'Yanıt yazılıyor': 'Escribiendo respuesta', 'İnternette araştırılıyor': 'Buscando en internet', 'Mimari plan çıkarılıyor': 'Elaborando plan', 'çalışıyor': 'en curso',
            'Yapay zekadan yanıt alınamadı.': 'No se pudo obtener respuesta de la IA.', 'Bilinmeyen hata': 'Error desconocido',
            'Yapay zekadan yanıt alınamadı': 'No se pudo obtener respuesta de la IA', 'Yapay zeka kaynağı yeniden ayarlanmalı': 'Hay que reconfigurar la fuente de IA',
            'Ayarlar → Yapay Zeka bölümünden bir sağlayıcı seçip anahtarını ekle, ardından ': 'En Ajustes → IA elige un proveedor, añade tu clave y luego usa ',
            ' butonunu kullan.': 'el botón de prueba.',
            'Anahtar geçersiz görünüyor. Ayarlar → Yapay Zeka bölümünden güncelleyip ': 'La clave parece inválida. Actualízala en Ajustes → IA y verifica con ',
            ' ile doğrula.': '.',
            'Aktif sağlayıcı: ': 'Proveedor activo: ',
            '. Ayarlar → Yapay Zeka bölümünden başka bir sağlayıcı ya da model seçmeyi dene.': '. En Ajustes → IA prueba otro proveedor o modelo.',
            'Bağlantını kontrol edip tekrar dene. Ağ engelleyicin isteği durduruyor olabilir.': 'Comprueba tu conexión e inténtalo de nuevo. Tu red o bloqueador puede estar deteniendo la solicitud.',
            'Tekrar deneyebilir ya da Ayarlar → Yapay Zeka bölümünden ': 'Inténtalo de nuevo o elige en Ajustes → IA para ',
            ' için farklı bir model seçebilirsin.': ' otro modelo.',
            'Bu isimde komut yok — yazmaya devam et, normal mesaj olarak gönderilir.': 'No existe ese comando — sigue escribiendo; se enviará como mensaje normal.',
            '{n} kayıtlı bilgi · cihazında saklanıyor': '{n} datos guardados · se almacenan en tu dispositivo',
            '{n} ses kullanılabilir ({k} Türkçe) — tüm diller listelenir; tarayıcının desteklediği sesler cihazına göre değişir.': '{n} voces disponibles ({k} turcas) — lista completa; las voces dependen del navegador y dispositivo.',
            'Yanıtları otomatik olarak seslendir': 'Leer las respuestas automáticamente',
            'Bildirim sesleri — yanıt gelince iMessage tarzı çal': 'Sonidos de notificación — estilo iMessage al responder',
            'Göster': 'Mostrar', 'Gizle': 'Ocultar',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler (on/off)': 'Modo honestidad — sin halagos; si una idea no funciona, lo dice claramente (on/off)',
            'Dürüstlük modu açık. Bundan sonra süsleme yok: fikir kötüyse "tutmaz" derim, riskleri baştan söylerim, yapılabileceğini sanmıyorsam açıkça söylerim. Övgü yerine gerçek değerlendirim olur.': 'Modo honestidad activado. Sin adornos: si una idea es mala, digo «no funciona»; avanzo los riesgos de entrada; si creo que algo no saldrá, lo digo sin rodeos. En vez de halagos, evaluación real.',
            'Dürüstlük modu kapandı. Standart asistan tonuna döndüm.': 'Modo honestidad desactivado. Vuelvo al tono estándar.',
            'ACSMOD açık (geliştirici modu). Gereksiz uyarı ve moral dersi yok; teknik konuları doğrudan anlatırım. Yasadışı ya da zarar verici işler yine olmaz — o kısımları reddederim.': 'ACSMOD activado (modo desarrollador). Sin advertencias innecesarias ni sermones; explico temas técnicos directamente. Lo ilegal o dañino sigue rechazándose.',
            'ACSMOD kapandı. Standart tona döndüm.': 'ACSMOD desactivado. Vuelvo al tono estándar.',
            'Motor sağlık testi çalışıyor…': 'Probando el estado de los motores…',
            'Sohbet motoru: ÇALIŞIYOR': 'Motor de chat: FUNCIONA',
            'Sohbet motoru: HATA': 'Motor de chat: ERROR',
            'Görsel motoru: ÇALIŞIYOR': 'Motor de imagen: FUNCIONA',
            'Görsel motoru: HATA': 'Motor de imagen: ERROR',
            'zaman aşımı': 'tiempo agotado',
            'bilinmeyen hata': 'error desconocido',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler, riskleri gizlemez': 'Modo honestidad — sin halagos; dice claramente si una idea no funciona y no oculta riesgos'
        },

        hi: {
            '[yerel]': '[स्थानीय]', '[çevrimiçi]': '[ऑनलाइन]',
            "İsteğe bağlı hız anahtarı: token.llm7.io — limiti yükseltir, zorunlu değildir.": "वैकल्पिक स्पीड कुंजी: token.llm7.io — सीमा बढ़ाती है, अनिवार्य नहीं।",
            "Anahtarsız çalışır (günlük ~1M token). Modeli aşağıdan seçebilirsin.": "बिना कुंजी चलता है (~1M टोकन/दिन)। मॉडल नीचे चुनें।",
            "API anahtarı gerekmez.": "API कुंजी आवश्यक नहीं।",
            "Görsel okuma (vision) desteklenir.": "चित्र पहचान (vision) समर्थित है।",
            "Google AI Studio ücretsiz katmanı: kredi kartı istemez.": "Google AI Studio मुफ़्त स्तर: क्रेडिट कार्ड नहीं चाहिए।",
            "Groq ücretsiz katmanı çok hızlıdır (LPU).": "Groq मुफ़्त स्तर बहुत तेज़ है (LPU)।",
            "Sonu \":free\" ile biten modeller ücretsizdir.": "\":free\" पर समाप्त होने वाले मॉडल मुफ़्त हैं।",
            "OpenAI ücretsiz katman sunmaz; kullanım için bakiye gerekir.": "OpenAI मुफ़्त स्तर नहीं देता; बैलेंस चाहिए।",
            "Ollama, LM Studio, vLLM, DeepSeek, Mistral… OpenAI uyumlu her sunucu.": "Ollama, LM Studio, vLLM, DeepSeek, Mistral… कोई भी OpenAI-संगत सर्वर।",
            "Anahtarsız, ücretsiz NesilAI motoru. Gerçek modeli aşağıdan seç.": "बिना कुंजी मुफ़्त NesilAI इंजन। नीचे से मॉडल चुनें।",
            'Kaydet': 'सहेजें',
            'Örnek: Ollama': 'उदाहरण: Ollama', 'LM Studio': 'LM Studio',
            'Ayrıca sohbete': 'चैट में भी', 'yazarak da açıp kapatabilirsin.': 'लिखकर चालू/बंद कर सकते हैं।',
            'Yeni sohbet': 'नया चैट', 'Kendini Tanıt': 'अपना परिचय दें', 'Sohbetler': 'चैट',
            'Bilgiler': 'जानकारी', 'Ücretsiz Plan': 'मुफ़्त प्लान', 'Free Plan': 'मुफ़्त प्लान',
            'Üretim havuzu': 'निर्माण गैलरी', 'Ayarlar': 'सेटिंग्स',
            'NesilAI ile çalışmaya başla': 'NesilAI के साथ शुरुआत करें',
            'Gerçek bir yapay zeka modeliyle sohbet et, görsel oluştur, sesini yazıya çevir ve yüklediğin görselleri okut.': 'असली AI मॉडल से बात करें, चित्र बनाएं, आवाज़ को टेक्स्ट में बदलें और अपलोड किए चित्र पढ़ें।',
            'Aktif kaynak:': 'सक्रिय स्रोत:', 'Kaynağı değiştir': 'स्रोत बदलें', 'Anahtarını ekle': 'कुंजी जोड़ें',
            'Görsel oluştur': 'चित्र बनाएं', 'Neon ışıklı siberpunk bir şehir': 'नियॉन रोशनी वाला साइबरपंक शहर',
            'Asistanı tanı': 'असिस्टेंट को जानें', 'Neler yapabildiğini anlat': 'मैं क्या कर सकता हूँ',
            'Kod yaz': 'कोड लिखें', 'JavaScript todo uygulaması': 'JavaScript टू-डू ऐप',
            'Yazı üret': 'निबंध लिखें', 'Yapay zekanın geleceği': 'AI का भविष्य',
            'Ara': 'खोजें', 'Model ara…': 'मॉडल खोजें…',
            'Kendi API anahtarını eklemek için Ayarlar → Yapay Zeka.': 'अपनी API कुंजी जोड़ने के लिए: सेटिंग्स → AI।',
            'Seçtiğin mod, gönderdiğin her mesajı o türde üretir.': 'आपका चुना मोड हर संदेश का प्रकार तय करता है।',
            'Komutu seç ya da yazmaya devam et — boşluk bırakınca talimatını ekleyebilirsin.': 'कमांड चुनें या लिखते रहें — स्पेस देकर निर्देश जोड़ सकते हैं।',
            'Görsel yükle': 'चित्र अपलोड करें', 'Görsel yükle ve metnini okut': 'चित्र अपलोड करें और टेक्स्ट पढ़ें',
            'Sesle yaz': 'आवाज़ से लिखें', 'Yanıtı durdur': 'उत्तर रोकें', 'Gönder': 'भेजें', 'Bir mesaj yaz…': 'संदेश लिखें…',
            'Enter ile gönder · Shift+Enter ile satır atla · Yanıtlar hatalı olabilir, önemli bilgileri doğrula': 'Enter — भेजें · Shift+Enter — नई लाइन · उत्तर गलत हो सकते हैं, ज़रूरी जानकारी जाँचें',
            'Sağlayıcı ayarla': 'प्रदाता सेट करें', 'anahtar gerekli': 'कुंजी आवश्यक', '(kurulum gerekli)': '(सेटअप आवश्यक)',
            'Menüyü aç/kapat': 'मेनू खोलें/बंद करें', 'Tema değiştir': 'थीम बदलें', 'Açık/koyu tema': 'लाइट/डार्क थीम', 'Sesli': 'वॉइस',
            'Model': 'मॉडल', 'Sohbet': 'चैट', 'Normal yapay zeka sohbeti': 'सामान्य AI चैट',
            'Görsel üret': 'चित्र बनाएं', 'Yazdığın tarif görsel olur': 'आपका विवरण चित्र बन जाएगा',
            'Müzik / Ses': 'संगीत / ध्वनि', 'Şarkı, enstrümantal veya seslendirme': 'गाना, इंस्ट्रूमेंटल या वॉइसओवर',
            'aktif': 'सक्रिय',
            'Mod: {m} — yazdığın her şey {m} olarak üretilcek': 'मोड: {m} — आपका हर संदेश {m} के रूप में बनेगा',
            'NesilAI YZ · {m} seçildi': 'NesilAI YZ · {m} चयनित', 'Ayarlar kaydedildi': 'सेटिंग्स सहेजी गईं',
            'Yapay zeka sağlayıcısı, ses ve veri seçenekleri.': 'AI प्रदाता, आवाज़ और डेटा विकल्प।',
            'Yapay zeka': 'आर्टिफिशियल इंटेलिजेंस', 'Sağlayıcı': 'प्रदाता', 'NesilAI YZ modeli': 'NesilAI YZ मॉडल',
            'Minimax, Codestral, GLM, Mistral Nemo — anahtarsız çalışır.': 'Minimax, Codestral, GLM, Mistral Nemo — बिना कुंजी।',
            'Anahtarsız çalışır; modeli istediğin an değiştirebilirsin. Değişiklik anında kaydedilir.': 'बिना कुंजी चलता है; मॉडल कभी भी बदलें। बदलाव तुरंत सहेजा जाता है।',
            'Listeden seçebilir ya da model adını elle yazabilirsin.': 'सूची से चुनें या मॉडल का नाम हाथ से लिखें।',
            'API anahtarı': 'API कुंजी', 'Anahtarını buraya yapıştır': 'अपनी कुंजी यहाँ पेस्ट करें', 'Göster': 'दिखाएँ',
            'API anahtarı al ↗': 'API कुंजी प्राप्त करें ↗',
            'Anahtar yalnızca bu tarayıcının localStorage alanında tutulur, hiçbir sunucuya gönderilmez.': 'कुंजी केवल इस ब्राउज़र के localStorage में रहती है, किसी सर्वर पर नहीं जाती।',
            'Sunucu adresi (OpenAI uyumlu)': 'सर्वर पता (OpenAI-संगत)',
            'Yaratıcılık (temperature) —': 'रचनात्मकता (temperature) —',
            'Düşük değer daha kesin, yüksek değer daha yaratıcı yanıt üretir.': 'कम मान = अधिक सटीक, अधिक मान = अधिक रचनात्मक।',
            'Bağlantıyı test et': 'कनेक्शन जाँचें', 'Bağlantı test ediliyor...': 'कनेक्शन जाँच रहा है...',
            'Kendi anahtarını kullanmak, hesapların ve kotaların sana ait olmasını sağlar. Başkasının yayınladığı anahtarlar güvenlik ihlali olur ve çalışmaz — denemek için ücretsiz katman sunan sağlayıcıları (Gemini, Groq, OpenRouter) kullan.': 'अपनी कुंजी से खाते और कोटा आपके रहते हैं। दूसरों की प्रकाशित कुंजियाँ सुरक्षा उल्लंघन हैं और काम नहीं करतीं — आज़माने के लिए मुफ़्त स्तर वाले प्रदाता (Gemini, Groq, OpenRouter) चुनें।',
            'Dil Seçme': 'भाषा चयन', 'Yanıt dili': 'उत्तर की भाषा',
            'Yapay zeka, seçtiğin dilde yanıt verir. "Otomatik" seçersen hangi dilde yazarsan o dilde yanıtlar.': 'AI चुनी गई भाषा में जवाब देगा। «स्वतः» पर वह भाषा में जवाब देगा जिसमें आप लिखें।',
            'Diğer dil — kendin seç': 'अन्य भाषा — स्वयं चुनें',
            'Listede olmayan herhangi bir dilin adını yaz; yapay zeka o dilde yanıtlar.': 'सूची में न होने वाली किसी भी भाषा का नाम लिखें; AI उसी भाषा में जवाब देगा।',
            'Arayüz dili': 'इंटरफ़ेस भाषा',
            'Menülerin ve düğmelerin dili. "Otomatik" seçiliyse yanıt dilini izler.': 'मेनू और बटनों की भाषा। «स्वतः» पर यह उत्तर भाषा का अनुसरण करती है।',
            'Ses': 'ध्वनि', 'Seslendirici': 'आवाज़', 'Konuşma hızı —': 'बोलने की गति —', 'Ses tonu —': 'आवाज़ का सुर —',
            'Bellek': 'मेमोरी', 'Kalıcı bellek açık — adın, projelerin ve tercihleriniz yeni sohbetlerde hatırlanır': 'स्थायी मेमोरी चालू — आपका नाम, प्रोजेक्ट और पसंद नए चैट में याद रहते हैं',
            'Tüm belleği temizle': 'पूरी मेमोरी मिटाएँ', 'Veri': 'डेटा', 'Tüm sohbet geçmişini sil': 'पूरा चैट इतिहास मिटाएँ',
            'Yanıt Stili': 'उत्तर शैली', 'İnsan gibi yaz — AI-Slop\'u kapat (kalıp cümleler, boş nezaket, liste yığını yok)': 'इंसान की तरह लिखें — AI-Slop बंद करें (घिसे-पिटे वाक्य, खोखली विनम्रता, लंबी सूचियाँ)',
            'Görünüm': 'दिखावट', 'Cihaz modu': 'डिवाइस मोड', 'Kaydet ve kapat': 'सहेजें और बंद करें',
            'Sistem sesleri yükleniyor…': 'सिस्टम आवाज़ें लोड हो रही हैं…',
            'Henüz kayıtlı bilgi yok. Sohbet ederken "adım Alperen" gibi kalıcı bilgiler yazarsan burada görünür.': 'अभी कोई जानकारी नहीं। चैट में लिखें «मेरा नाम … है» — मैं याद रखूँगा।',
            'Sil': 'हटाएँ', 'Sohbet silindi': 'चैट हटाई गई', 'Galeri temizlendi': 'गैलरी साफ़ हुई',
            'Üretim havuzu: görseller hazır': 'निर्माण गैलरी: चित्र तैयार',
            'En azından adını yaz — gerisi isteğe bağlı': 'कम से कम नाम लिखें — बाकी वैकल्पिक है',
            'Gizli bellek güncellendi — artık seni tanıyorum': 'गुप्त मेमोरी अपडेट हुई — मैं आपको जान गया',
            'Gizli bellek kaydedilemedi': 'गुप्त मेमोरी सहेजी नहीं जा सकी', 'Gizli bellek temizlendi': 'गुप्त मेमोरी साफ़ हुई',
            'Yanıt durduruldu': 'उत्तर रोक दिया गया', 'Konuşma tanıma desteklenmiyor': 'स्पीच रिकग्निशन समर्थित नहीं',
            'Kayıt durduruldu': 'रिकॉर्डिंग रुकी', 'Sizi dinliyorum, konuşabilirsiniz...': 'मैं सुन रहा हूँ, बोलिए...',
            'Mikrofon izni reddedildi — adres çubuğundaki kilit/izn menüsünden izin ver': 'माइक अनुमति अस्वीकृत — एड्रेस बार के लॉक/परमिशन मेनू से अनुमति दें',
            'Konuşma tanıma servisine ulaşılamadı': 'स्पीच रिकग्निशन सेवा तक नहीं पहुँच पाए', 'Mikrofon açılamadı': 'माइक्रोफ़ोन चालू नहीं हो सका',
            'Sesli sohbet bu tarayıcıda tam desteklenmiyor': 'वॉइस चैट इस ब्राउज़र में पूरी तरह समर्थित नहीं',
            'Lütfen bir resim dosyası seçin': 'कृपया एक चित्र फ़ाइल चुनें', 'Görsel başarıyla analiz edildi': 'चित्र सफलतापूर्वक विश्लेषित हुआ',
            'Seslendirme başlatılamadı': 'वॉइसओवर शुरू नहीं हो सका', 'Mikrofon hatası: {c}': 'माइक्रोफ़ोन त्रुटि: {c}',
            'Derin düşünür, detaylı araştırıp yanıtlar': 'गहराई से सोचता है, विस्तार से शोध कर उत्तर देता है',
            'İnternette derin araştırma yapıp rapor hazırlar': 'इंटरनेट पर गहन शोध कर रिपोर्ट बनाता है',
            'Araştırır, plan çıkarır, kod yazar': 'शोध करता है, योजना बनाता है, कोड लिखता है',
            'Kodlama ajanı — dosyaları okur, yazar, oluşturur, siler (on/off)': 'कोडिंग एजेंट — फ़ाइलें पढ़ता, लिखता, बनाता, मिटाता है (on/off)',
            'Ekranını canlı izlet — PC ekran asistanı (on/off/settings)': 'स्क्रीन लाइव दिखाएँ — PC स्क्रीन असिस्टेंट (on/off/settings)',
            'AI-Slop\'u kapat — insan gibi konuşur (on/off)': 'AI-Slop बंद करें — इंसान की तरह बात करता है (on/off)',
            'Ayarlar panelini açar (sağlayıcı, model, ses, veri)': 'सेटिंग्स पैनल खोलता है (प्रदाता, मॉडल, आवाज़, डेटा)',
            'Açık/koyu temayı değiştirir': 'लाइट/डार्क थीम बदलता है', 'Sesli sohbet modunu açar': 'वॉइस चैट मोड खोलता है',
            'Tüm sohbet geçmişini siler': 'पूरा चैट इतिहास मिटाता है', 'Tüm komutları listeler': 'सभी कमांड सूचीबद्ध करता है',
            'Tüm komutları listeler (/yardim ile aynı)': 'सभी कमांड सूचीबद्ध करता है (/yardim जैसा)',
            'Komutlar: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim': 'कमांड: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim',
            'Yanıt verirken internette araştırma yap': 'उत्तर देते समय इंटरनेट पर खोजें',
            'NesilAI YZ modelini değiştir': 'NesilAI YZ मॉडल बदलें', 'Üretim modu seç': 'निर्माण मोड चुनें',
            'Ücretsiz hız anahtarı (isteğe bağlı)': 'मुफ़्त स्पीड कुंजी (वैकल्पिक)',
            'Ücretsiz hız anahtarı al ↗': 'मुफ़्त कुंजी प्राप्त करें ↗',
            'İsteğe bağlı: alırsan hız limitin yükselir; anahtarsız da çalışır.': 'वैकल्पिक: कुंजी से सीमा बढ़ती है; बिना भी चलता है।',
            'Anahtar eklendi — limitin yükseltildi': 'कुंजी जोड़ी गई — सीमा बढ़ाई गई',
            'NesilAI YZ yoğun — otomatik yedek motora geçildi': 'NesilAI YZ व्यस्त — बैकअप इंजन पर स्विच किया गया',
            'Uygulamayı indir': 'ऐप डाउनलोड करें', 'Android uygulaması': 'Android ऐप', 'Bilgisayar uygulaması': 'PC ऐप',
            'Kapat': 'बंद करें', 'Eki kaldır': 'अटैचमेंट हटाएँ', 'Mesaj': 'संदेश', 'Kenar çubuğu': 'साइडबार',
            'Kitaplık': 'लाइब्रेरी', 'Üretilen tüm görsel, müzik ve videolar burada birikir.': 'सभी बनाए गए चित्र, संगीत और वीडियो यहाँ जमा होते हैं।', 'Tümü': 'सभी', 'Görseller': 'चित्र', 'Müzik & Ses': 'संगीत और ध्वनि', 'Videolar': 'वीडियो', 'Üretim bilgisi': 'निर्माण जानकारी', 'Motor': 'इंजन', 'Tarih': 'तारीख', 'Prompt': 'प्रॉम्प्ट', 'İndir': 'डाउनलोड', 'Ön izle': 'प्रीव्यू', 'Görsel': 'चित्र', 'Müzik': 'संगीत', 'Video': 'वीडियो', 'Müzik/Ses': 'संगीत/ध्वनि', 'Dinle': 'सुनें', 'Kopyala': 'कॉपी करें', 'Kitaplık yükleniyor…': 'लाइब्रेरी लोड हो रही है…', 'Kitaplık henüz boş. Sohbette ya da Üretim havuzunda görsel, müzik veya video üret; hepsi burada birikecek.': 'लाइब्रेरी अभी खाली है। चैट या निर्माण गैलरी में चित्र, संगीत या वीडियो बनाएँ; सब यहाँ जमा होगा।', 'Prompt ve motor bilgisi': 'प्रॉम्प्ट और इंजन जानकारी', 'Bilgi: prompt ve motor': 'जानकारी: प्रॉम्प्ट और इंजन', 'Kitaplık görseli': 'लाइब्रेरी चित्र',
            'Model seç': 'मॉडल चुनें', 'Komut seç': 'कमांड चुनें', 'Kaydı başlat/durdur': 'रिकॉर्डिंग शुरू/रोकें',
            'Mikrofonu aç/kapat': 'माइक चालू/बंद', 'Sohbeti bitir': 'चैट समाप्त करें', 'NesilAI logosu': 'NesilAI लोगो',
            'Kendini tanıt': 'परिचय दें', 'NesilAI Bilgileri': 'NesilAI जानकारी', 'Sesli sohbet': 'वॉइस चैट',
            'Yapay zeka motoru, gizlilik ve kullanım kılavuzu — hepsi burada.': 'AI इंजन, प्राइवेसी और उपयोग गाइड — सब यहाँ।',
            'NesilAI nedir?': 'NesilAI क्या है?', 'Gizlilik: verileriniz nerede?': 'प्राइवेसी: आपका डेटा कहाँ है?',
            'Yapay zeka motoru': 'AI इंजन', 'Kullanım kılavuzu': 'उपयोग गाइड', 'Sosyal medya': 'सोशल मीडिया', 'Üç ilke': 'तीन सिद्धांत', 'Gizlilik & Güvenlik': 'गोपनीयता और सुरक्षा', 'Kullanıcı Sözleşmesi': 'उपयोगकर्ता अनुबंध',
            "Instagram'da takip et": 'Instagram पर फ़ॉलो करें', 'Tarafından Bloodline INC.': 'Bloodline INC. द्वारा',
            'Yapay zeka sohbetinden bağımsız üretim atölyesi — üret, dinle, indir.': 'AI चैट से स्वतंत्र निर्माण स्टूडियो — बनाएँ, सुनें, डाउनलोड करें।',
            'NesilAI, Bloodline üzerinde çalışan bir yapay zeka asistanıdır; Acsida tarafından geliştirilmiştir. Sohbet, görsel üretimi, ses↔yazı ve': 'NesilAI, Bloodline पर चलने वाला AI असिस्टेंट है; Acsida द्वारा विकसित। चैट, चित्र निर्माण, आवाज़↔टेक्स्ट और',
            'ekran asistanı gibi yetenekleri vardır. OpenView yalnızca bilgisayar uygulamasında ayrı bir pencere olarak çalışır; web sürümünde ayrı bir PiP penceresi açar.': 'स्क्रीन असिस्टेंट OpenView जैसी क्षमताएँ हैं। OpenView केवल PC ऐप में अलग विंडो में चलता है; वेब में PiP विंडो खोलता है।',
            'Loglar ve sohbetler': 'लॉग और चैट', "'nda tutulur — sunucuya gönderilmez.": '— में रहते हैं; सर्वर पर नहीं जाते।',
            '(Kendini Tanıt bilgileri) cihazınızda şifrelenmiş alan adında tutulur; hiçbir arayüzde gösterilmez.': '(परिचय जानकारी) आपके डिवाइस पर एन्क्रिप्टेड रूप में रहती है; कहीं नहीं दिखती।',
            'OpenView ekran görüntüleri': 'OpenView स्क्रीनशॉट',
            'yalnızca sorduğunuz anda alınır, yanıt verdikten sonra atılır; kalıcı saklanmaz.': 'केवल पूछने पर लिए जाते हैं, जवाब के बाद हटा दिए जाते हैं; सहेजे नहीं जाते।',
            'Üretim görselleri/müzik/videolar': 'बनाए गए चित्र/संगीत/वीडियो',
            "IndexedDB'de saklanır; sohbeti silmek bunları da silmez.": 'IndexedDB में रहते हैं; चैट मिटाने से ये नहीं मिटते।',
            'Sohbet: ücretsiz, anahtarsız NesilAI YZ — limitte otomatik yedek motora geçer.': 'चैट: मुफ़्त, बिना कुंजी NesilAI YZ — सीमा पर बैकअप इंजन पर स्विच होता है।',
            "Görsel: Pollinations + AI Horde (bağımsız yedek) — Türkçe promptlar otomatik İngilizce'ye çevrilir.": 'चित्र: Pollinations + AI Horde (स्वतंत्र बैकअप) — तुर्की प्रॉम्प्ट अंग्रेज़ी में अनुवादित होते हैं।',
            'Ses: Web Speech API; çalışmazsa cihazınızda çalışan yerel Whisper modeli devreye girer.': 'आवाज़: Web Speech API; न चलने पर डिवाइस का लोकल Whisper मॉडल चालू होता है।',
            '(ekran asistanı), ': '(स्क्रीन असिस्टेंट), ', '(insan gibi yazma), ': '(इंसान जैसा लेखन), ',
            'yeni sohbette adını, yaşını, ilgi alanlarını yaz — AI artık sana özel konuşur (gizli belleğe yazılır).': 'नए चैट में नाम, उम्र, रुचियाँ लिखें — AI व्यक्तिगत रूप से बात करेगा (गुप्त मेमोरी में सहेजा जाता है)।',
            'mesaj kutusuna ne istediğini yaz; "görsel oluştur" gibi ifadeler otomatik görsel moduna geçer.': 'संदेश बॉक्स में लिखें; «चित्र बनाओ» जैसे शब्द चित्र मोड में बदल जाते हैं।',
            'birden çok görseli/müziği tek seferde üret, sonuçları galeriden yönet.': 'एक साथ कई चित्र/गाने बनाएँ, परिणाम गैलरी में प्रबंधित करें।',
            'OpenView için': 'OpenView के लिए', "(Ayarlar'dan değiştirilebilir).": '(सेटिंग्स में बदल सकते हैं)।',
            'Otomatik (ekran genişliğine göre)': 'स्वतः (स्क्रीन चौड़ाई के अनुसार)',
            'Telefon — kompakt tek kolon, büyük dokunma hedefleri': 'फ़ोन — कॉम्पैक्ट, बड़े बटन',
            'Masaüstü — tam arayüz': 'PC — पूरा इंटरफ़ेस',
            'Telefon modunda renkler, yazı boyutları ve dokunma alanları tamamen telefona göre ayarlanır; hangi ekranda olursan ol telefon düzeninde kalır.': 'फ़ोन मोड में रंग, फ़ॉन्ट और बटन फ़ोन के अनुसार होते हैं; किसी भी स्क्रीन पर फ़ोन दृश्य रहता है।',
            'NesilAI YZ (ücretsiz — anahtar yok)': 'NesilAI YZ (मुफ़्त — बिना कुंजी)',
            'Google Gemini (AI Studio anahtarı)': 'Google Gemini (AI Studio कुंजी)',
            'Groq Cloud (ücretsiz kota)': 'Groq Cloud (मुफ़्त कोटा)',
            'OpenRouter (ücretsiz modeller var)': 'OpenRouter (मुफ़्त मॉडल उपलब्ध)',
            'OpenAI (kendi anahtarınla)': 'OpenAI (अपनी कुंजी)',
            'Özel uç nokta (OpenAI uyumlu)': 'अपना सर्वर (OpenAI-संगत)',
            'Otomatik (kullanıcının dili)': 'स्वतः (उपयोगकर्ता की भाषा)',
            'Rusça': 'रूसी', 'Türkçe': 'तुर्की', 'İspanyolca': 'स्पेनिश', 'Hintçe': 'हिन्दी', 'Almanca': 'जर्मन', 'İngilizce': 'अंग्रेज़ी',
            'Otomatik (yanıt dilini izle)': 'स्वतः (उत्तर भाषा के अनुसार)',
            '✏️ Diğer dili kendin seç…': '✏️ अन्य भाषा — अपनी पसंद…',
            'Genel amaçlı, uzun bağlam (180K)': 'सामान्य, लंबा कॉन्टेक्स्ट (180K)',
            'Kod için optimize': 'कोड के लिए', 'Hızlı, 400K bağlam': 'तेज़, 400K कॉन्टेक्स्ट', 'Hafif ve hızlı': 'हल्का और तेज़',
            'Yanıt yazılıyor': 'उत्तर लिखा जा रहा है', 'İnternette araştırılıyor': 'इंटरनेट पर खोजा जा रहा है', 'Mimari plan çıkarılıyor': 'योजना बनाई जा रही है', 'çalışıyor': 'चल रहा है',
            'Yapay zekadan yanıt alınamadı.': 'AI से उत्तर नहीं मिल सका।', 'Bilinmeyen hata': 'अज्ञात त्रुटि',
            'Yapay zekadan yanıt alınamadı': 'AI से उत्तर नहीं मिल सका', 'Yapay zeka kaynağı yeniden ayarlanmalı': 'AI स्रोत फिर से कॉन्फ़िगर करें',
            'Ayarlar → Yapay Zeka bölümünden bir sağlayıcı seçip anahtarını ekle, ardından ': 'सेटिंग्स → AI में प्रदाता चुनें, कुंजी जोड़ें, फिर ',
            ' butonunu kullan.': 'बटन दबाएँ।',
            'Anahtar geçersiz görünüyor. Ayarlar → Yapay Zeka bölümünden güncelleyip ': 'कुंजी अमान्य लगती है। सेटिंग्स → AI में अपडेट करें और ',
            ' ile doğrula.': 'से जाँचें।',
            'Aktif sağlayıcı: ': 'सक्रिय प्रदाता: ',
            '. Ayarlar → Yapay Zeka bölümünden başka bir sağlayıcı ya da model seçmeyi dene.': '. सेटिंग्स → AI में दूसरा प्रदाता या मॉडल चुनें।',
            'Bağlantını kontrol edip tekrar dene. Ağ engelleyicin isteği durduruyor olabilir.': 'कनेक्शन जाँचें और फिर से कोशिश करें। संभव है नेटवर्क/ब्लॉकर रोक रहा हो।',
            'Tekrar deneyebilir ya da Ayarlar → Yapay Zeka bölümünden ': 'फिर कोशिश करें या सेटिंग्स → AI में ',
            ' için farklı bir model seçebilirsin.': ' के लिए दूसरा मॉडल चुनें।',
            'Bu isimde komut yok — yazmaya devam et, normal mesaj olarak gönderilir.': 'यह कमांड नहीं है — लिखते रहें; सामान्य संदेश बनकर जाएगा।',
            '{n} kayıtlı bilgi · cihazında saklanıyor': '{n} सहेजी गई जानकारी · डिवाइस पर सुरक्षित',
            '{n} ses kullanılabilir ({k} Türkçe) — tüm diller listelenir; tarayıcının desteklediği sesler cihazına göre değişir.': '{n} आवाज़ें उपलब्ध ({k} तुर्की) — पूरी सूची; उपलब्ध आवाज़ें ब्राउज़र/डिवाइस पर निर्भर।',
            'Yanıtları otomatik olarak seslendir': 'उत्तर स्वतः बोलकर सुनाएँ',
            'Bildirim sesleri — yanıt gelince iMessage tarzı çal': 'सूचना ध्वनियाँ — जवाब पर iMessage शैली',
            'Göster': 'दिखाएँ', 'Gizle': 'छिपाएँ',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler (on/off)': 'ईमानदारी मोड — तारीफ़ नहीं; विचार काम न आए तो साफ़ कहेगा (on/off)',
            'Dürüstlük modu açık. Bundan sonra süsleme yok: fikir kötüyse "tutmaz" derim, riskleri baştan söylerim, yapılabileceğini sanmıyorsam açıkça söylerim. Övgü yerine gerçek değerlendirim olur.': 'ईमानदारी मोड चालू। अब सजावट नहीं: विचार कमज़ोर है तो साफ़ कहूँगा "नहीं चलेगा", जोखिम पहले ही बताऊँगा; अगर कुछ संभव नहीं लगता तो खुलकर कहूँगा। तारीफ़ की जगह असली समीक्षा।',
            'Dürüstlük modu kapandı. Standart asistan tonuna döndüm.': 'ईमानदारी मोड बंद। सामान्य अंदाज़ पर लौट गया।',
            'ACSMOD açık (geliştirici modu). Gereksiz uyarı ve moral dersi yok; teknik konuları doğrudan anlatırım. Yasadışı ya da zarar verici işler yine olmaz — o kısımları reddederim.': 'ACSMOD चालू (डेवलपर मोड)। फ़ालतू चेतावनी और उपदेश नहीं; तकनीकी विषय सीधे समझाऊँगा। अवैध या हानिकारक काम फिर भी अस्वीकार।',
            'ACSMOD kapandı. Standart tona döndüm.': 'ACSMOD बंद। सामान्य अंदाज़ पर लौट गया।',
            'Motor sağlık testi çalışıyor…': 'इंजन स्वास्थ्य जाँच चल रही है…',
            'Sohbet motoru: ÇALIŞIYOR': 'चैट इंजन: चालू',
            'Sohbet motoru: HATA': 'चैट इंजन: त्रुटि',
            'Görsel motoru: ÇALIŞIYOR': 'इमेज इंजन: चालू',
            'Görsel motoru: HATA': 'इमेज इंजन: त्रुटि',
            'zaman aşımı': 'समय समाप्त',
            'bilinmeyen hata': 'अज्ञात त्रुटि',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler, riskleri gizlemez': 'ईमानदारी मोड — तारीफ़ नहीं; विचार काम न आए तो साफ़ कहता है, जोखिम नहीं छिपाता'
        },

        de: {
            '[yerel]': '[lokal]', '[çevrimiçi]': '[online]',
            "İsteğe bağlı hız anahtarı: token.llm7.io — limiti yükseltir, zorunlu değildir.": "Optionaler Geschwindigkeitsschlüssel: token.llm7.io — erhöht Limits, nicht Pflicht.",
            "Anahtarsız çalışır (günlük ~1M token). Modeli aşağıdan seçebilirsin.": "Läuft ohne Schlüssel (~1M Token/Tag). Modell unten wählbar.",
            "API anahtarı gerekmez.": "Kein API-Schlüssel nötig.",
            "Görsel okuma (vision) desteklenir.": "Bilderkennung (vision) wird unterstützt.",
            "Google AI Studio ücretsiz katmanı: kredi kartı istemez.": "Kostenlose Stufe von Google AI Studio: ohne Kreditkarte.",
            "Groq ücretsiz katmanı çok hızlıdır (LPU).": "Die kostenlose Stufe von Groq ist sehr schnell (LPU).",
            "Sonu \":free\" ile biten modeller ücretsizdir.": "Modelle mit der Endung \":free\" sind kostenlos.",
            "OpenAI ücretsiz katman sunmaz; kullanım için bakiye gerekir.": "OpenAI bietet keine kostenlose Stufe; Guthaben nötig.",
            "Ollama, LM Studio, vLLM, DeepSeek, Mistral… OpenAI uyumlu her sunucu.": "Ollama, LM Studio, vLLM, DeepSeek, Mistral… jeder OpenAI-kompatible Server.",
            "Anahtarsız, ücretsiz NesilAI motoru. Gerçek modeli aşağıdan seç.": "Kostenlose NesilAI-Engine ohne Schlüssel. Modell unten wählen.",
            'Kaydet': 'Speichern',
            'Örnek: Ollama': 'Beispiel: Ollama', 'LM Studio': 'LM Studio',
            'Ayrıca sohbete': 'Auch im Chat', 'yazarak da açıp kapatabilirsin.': 'kannst du ein- und ausschalten.',
            'Yeni sohbet': 'Neuer Chat', 'Kendini Tanıt': 'Vorstellen', 'Sohbetler': 'Chats',
            'Bilgiler': 'Info', 'Ücretsiz Plan': 'Kostenloser Plan', 'Free Plan': 'Kostenloser Plan',
            'Üretim havuzu': 'Erstellungs-Galerie', 'Ayarlar': 'Einstellungen',
            'NesilAI ile çalışmaya başla': 'Mit NesilAI loslegen',
            'Gerçek bir yapay zeka modeliyle sohbet et, görsel oluştur, sesini yazıya çevir ve yüklediğin görselleri okut.': 'Chatte mit einem echten KI-Modell, erstelle Bilder, wandele Sprache in Text und lies hochgeladene Bilder.',
            'Aktif kaynak:': 'Aktive Quelle:', 'Kaynağı değiştir': 'Quelle wechseln', 'Anahtarını ekle': 'Schlüssel hinzufügen',
            'Görsel oluştur': 'Bild erstellen', 'Neon ışıklı siberpunk bir şehir': 'Neonbeleuchtete Cyberpunk-Stadt',
            'Asistanı tanı': 'Assistent kennenlernen', 'Neler yapabildiğini anlat': 'Was ich kann',
            'Kod yaz': 'Code schreiben', 'JavaScript todo uygulaması': 'JavaScript-To-do-App',
            'Yazı üret': 'Text schreiben', 'Yapay zekanın geleceği': 'Die Zukunft der KI',
            'Ara': 'Suchen', 'Model ara…': 'Modell suchen…',
            'Kendi API anahtarını eklemek için Ayarlar → Yapay Zeka.': 'Eigenen API-Schlüssel hinzufügen: Einstellungen → KI.',
            'Seçtiğin mod, gönderdiğin her mesajı o türde üretir.': 'Der gewählte Modus bestimmt die Art jeder Nachricht.',
            'Komutu seç ya da yazmaya devam et — boşluk bırakınca talimatını ekleyebilirsin.': 'Befehl wählen oder weiterschreiben — mit Leerzeichen eigene Anweisung anhängen.',
            'Görsel yükle': 'Bild hochladen', 'Görsel yükle ve metnini okut': 'Bild hochladen und Text erkennen',
            'Sesle yaz': 'Spracheingabe', 'Yanıtı durdur': 'Antwort stoppen', 'Gönder': 'Senden', 'Bir mesaj yaz…': 'Nachricht schreiben…',
            'Enter ile gönder · Shift+Enter ile satır atla · Yanıtlar hatalı olabilir, önemli bilgileri doğrula': 'Enter sendet · Shift+Enter neue Zeile · Antworten können falsch sein — Wichtiges prüfen',
            'Sağlayıcı ayarla': 'Anbieter einrichten', 'anahtar gerekli': 'Schlüssel erforderlich', '(kurulum gerekli)': '(Einrichtung nötig)',
            'Menüyü aç/kapat': 'Menü öffnen/schließen', 'Tema değiştir': 'Design wechseln', 'Açık/koyu tema': 'Hell/Dunkel-Design', 'Sesli': 'Stimme',
            'Model': 'Modell', 'Sohbet': 'Chat', 'Normal yapay zeka sohbeti': 'Normaler KI-Chat',
            'Görsel üret': 'Bild erstellen', 'Yazdığın tarif görsel olur': 'Deine Beschreibung wird zum Bild',
            'Müzik / Ses': 'Musik / Sound', 'Şarkı, enstrümantal veya seslendirme': 'Song, Instrumental oder Voiceover',
            'aktif': 'aktiv',
            'Mod: {m} — yazdığın her şey {m} olarak üretilcek': 'Modus: {m} — alles, was du schreibst, wird als {m} erstellt',
            'NesilAI YZ · {m} seçildi': 'NesilAI YZ · {m} ausgewählt', 'Ayarlar kaydedildi': 'Einstellungen gespeichert',
            'Yapay zeka sağlayıcısı, ses ve veri seçenekleri.': 'KI-Anbieter, Stimme und Daten.',
            'Yapay zeka': 'Künstliche Intelligenz', 'Sağlayıcı': 'Anbieter', 'NesilAI YZ modeli': 'NesilAI YZ-Modell',
            'Minimax, Codestral, GLM, Mistral Nemo — anahtarsız çalışır.': 'Minimax, Codestral, GLM, Mistral Nemo — ohne Schlüssel.',
            'Anahtarsız çalışır; modeli istediğin an değiştirebilirsin. Değişiklik anında kaydedilir.': 'Läuft ohne Schlüssel; Modell jederzeit wechselbar. Änderung wird sofort gespeichert.',
            'Listeden seçebilir ya da model adını elle yazabilirsin.': 'Aus der Liste wählen oder Modellnamen manuell eingeben.',
            'API anahtarı': 'API-Schlüssel', 'Anahtarını buraya yapıştır': 'Schlüssel hier einfügen', 'Göster': 'Anzeigen',
            'API anahtarı al ↗': 'API-Schlüssel holen ↗',
            'Anahtar yalnızca bu tarayıcının localStorage alanında tutulur, hiçbir sunucuya gönderilmez.': 'Der Schlüssel bleibt im localStorage dieses Browsers und wird an keinen Server gesendet.',
            'Sunucu adresi (OpenAI uyumlu)': 'Serveradresse (OpenAI-kompatibel)',
            'Yaratıcılık (temperature) —': 'Kreativität (temperature) —',
            'Düşük değer daha kesin, yüksek değer daha yaratıcı yanıt üretir.': 'Niedrig = präziser, hoch = kreativer.',
            'Bağlantıyı test et': 'Verbindung testen', 'Bağlantı test ediliyor...': 'Verbindung wird getestet...',
            'Kendi anahtarını kullanmak, hesapların ve kotaların sana ait olmasını sağlar. Başkasının yayınladığı anahtarlar güvenlik ihlali olur ve çalışmaz — denemek için ücretsiz katman sunan sağlayıcıları (Gemini, Groq, OpenRouter) kullan.': 'Mit eigenem Schlüssel gehören Konten und Kontingente dir. Fremde veröffentlichte Schlüssel sind ein Sicherheitsverstoß und funktionieren nicht — zum Ausprobieren Anbieter mit kostenloser Stufe nutzen (Gemini, Groq, OpenRouter).',
            'Dil Seçme': 'Sprachauswahl', 'Yanıt dili': 'Antwortsprache',
            'Yapay zeka, seçtiğin dilde yanıt verir. "Otomatik" seçersen hangi dilde yazarsan o dilde yanıtlar.': 'Die KI antwortet in der gewählten Sprache. Bei „Automatisch“ antwortet sie in der Sprache deiner Nachricht.',
            'Diğer dil — kendin seç': 'Andere Sprache — selbst wählen',
            'Listede olmayan herhangi bir dilin adını yaz; yapay zeka o dilde yanıtlar.': 'Name einer beliebigen Sprache eintragen, die nicht in der Liste steht; die KI antwortet dann darin.',
            'Arayüz dili': 'Oberflächensprache',
            'Menülerin ve düğmelerin dili. "Otomatik" seçiliyse yanıt dilini izler.': 'Sprache der Menüs und Schaltflächen. Bei „Automatisch“ folgt sie der Antwortsprache.',
            'Ses': 'Stimme', 'Seslendirici': 'Stimme', 'Konuşma hızı —': 'Sprechgeschwindigkeit —', 'Ses tonu —': 'Stimmton —',
            'Bellek': 'Gedächtnis', 'Kalıcı bellek açık — adın, projelerin ve tercihleriniz yeni sohbetlerde hatırlanır': 'Dauerhaftes Gedächtnis aktiv — Name, Projekte und Vorlieben werden in neuen Chats erinnert',
            'Tüm belleği temizle': 'Gesamtes Gedächtnis löschen', 'Veri': 'Daten', 'Tüm sohbet geçmişini sil': 'Gesamten Chatverlauf löschen',
            'Yanıt Stili': 'Antwortstil', 'İnsan gibi yaz — AI-Slop\'u kapat (kalıp cümleler, boş nezaket, liste yığını yok)': 'Wie ein Mensch schreiben — AI-Slop aus (Floskeln, leere Höflichkeit, Listenwust)',
            'Görünüm': 'Darstellung', 'Cihaz modu': 'Gerätemodus', 'Kaydet ve kapat': 'Speichern und schließen',
            'Sistem sesleri yükleniyor…': 'Systemstimmen werden geladen…',
            'Henüz kayıtlı bilgi yok. Sohbet ederken "adım Alperen" gibi kalıcı bilgiler yazarsan burada görünür.': 'Noch nichts gespeichert. Schreibe im Chat „ich heiße …“ — ich merke es mir.',
            'Sil': 'Löschen', 'Sohbet silindi': 'Chat gelöscht', 'Galeri temizlendi': 'Galerie geleert',
            'Üretim havuzu: görseller hazır': 'Erstellungs-Galerie: Bilder bereit',
            'En azından adını yaz — gerisi isteğe bağlı': 'Schreibe wenigstens deinen Namen — der Rest ist optional',
            'Gizli bellek güncellendi — artık seni tanıyorum': 'Verstecktes Gedächtnis aktualisiert — ich kenne dich jetzt',
            'Gizli bellek kaydedilemedi': 'Verstecktes Gedächtnis konnte nicht gespeichert werden', 'Gizli bellek temizlendi': 'Verstecktes Gedächtnis geleert',
            'Yanıt durduruldu': 'Antwort gestoppt', 'Konuşma tanıma desteklenmiyor': 'Spracherkennung nicht unterstützt',
            'Kayıt durduruldu': 'Aufnahme gestoppt', 'Sizi dinliyorum, konuşabilirsiniz...': 'Ich höre zu, sprich...',
            'Mikrofon izni reddedildi — adres çubuğundaki kilit/izn menüsünden izin ver': 'Mikrofonzugriff verweigert — Erlaubnis über Schloss/Berechtigungsmenü in der Adressleiste erteilen',
            'Konuşma tanıma servisine ulaşılamadı': 'Spracherkennungsdienst nicht erreichbar', 'Mikrofon açılamadı': 'Mikrofon konnte nicht aktiviert werden',
            'Sesli sohbet bu tarayıcıda tam desteklenmiyor': 'Sprachchat wird in diesem Browser nicht vollständig unterstützt',
            'Lütfen bir resim dosyası seçin': 'Bitte eine Bilddatei auswählen', 'Görsel başarıyla analiz edildi': 'Bild erfolgreich analysiert',
            'Seslendirme başlatılamadı': 'Vorlesen nicht möglich', 'Mikrofon hatası: {c}': 'Mikrofonfehler: {c}',
            'Derin düşünür, detaylı araştırıp yanıtlar': 'Denkt tief nach, recherchiert ausführlich und antwortet',
            'İnternette derin araştırma yapıp rapor hazırlar': 'Recherchiert tief im Netz und erstellt einen Bericht',
            'Araştırır, plan çıkarır, kod yazar': 'Recherchiert, plant und schreibt Code',
            'Kodlama ajanı — dosyaları okur, yazar, oluşturur, siler (on/off)': 'Coding-Agent — liest, schreibt, erstellt, löscht Dateien (on/off)',
            'Ekranını canlı izlet — PC ekran asistanı (on/off/settings)': 'Bildschirm live zeigen — PC-Screen-Assistent (on/off/settings)',
            'AI-Slop\'u kapat — insan gibi konuşur (on/off)': 'AI-Slop aus — spricht wie ein Mensch (on/off)',
            'Ayarlar panelini açar (sağlayıcı, model, ses, veri)': 'Öffnet das Einstellungspanel (Anbieter, Modell, Stimme, Daten)',
            'Açık/koyu temayı değiştirir': 'Wechselt Hell/Dunkel-Design', 'Sesli sohbet modunu açar': 'Öffnet den Sprachchat-Modus',
            'Tüm sohbet geçmişini siler': 'Löscht den gesamten Chatverlauf', 'Tüm komutları listeler': 'Listet alle Befehle auf',
            'Tüm komutları listeler (/yardim ile aynı)': 'Listet alle Befehle auf (wie /yardim)',
            'Komutlar: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim': 'Befehle: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim',
            'Yanıt verirken internette araştırma yap': 'Beim Antworten im Internet suchen',
            'NesilAI YZ modelini değiştir': 'NesilAI YZ-Modell wechseln', 'Üretim modu seç': 'Erstellungsmodus wählen',
            'Ücretsiz hız anahtarı (isteğe bağlı)': 'Kostenloser Geschwindigkeitsschlüssel (optional)',
            'Ücretsiz hız anahtarı al ↗': 'Kostenlosen Schlüssel holen ↗',
            'İsteğe bağlı: alırsan hız limitin yükselir; anahtarsız da çalışır.': 'Optional: mit Schlüssel höhere Limits; läuft auch ohne.',
            'Anahtar eklendi — limitin yükseltildi': 'Schlüssel hinzugefügt — Limits erhöht',
            'NesilAI YZ yoğun — otomatik yedek motora geçildi': 'NesilAI YZ überlastet — auf Backup-Motor umgeschaltet',
            'Uygulamayı indir': 'App herunterladen', 'Android uygulaması': 'Android-App', 'Bilgisayar uygulaması': 'PC-App',
            'Kapat': 'Schließen', 'Eki kaldır': 'Anhang entfernen', 'Mesaj': 'Nachricht', 'Kenar çubuğu': 'Seitenleiste',
            'Kitaplık': 'Bibliothek', 'Üretilen tüm görsel, müzik ve videolar burada birikir.': 'Alle erstellten Bilder, Musik und Videos sammeln sich hier.', 'Tümü': 'Alle', 'Görseller': 'Bilder', 'Müzik & Ses': 'Musik & Sound', 'Videolar': 'Videos', 'Üretim bilgisi': 'Erstellungs-Info', 'Motor': 'Motor', 'Tarih': 'Datum', 'Prompt': 'Prompt', 'İndir': 'Herunterladen', 'Ön izle': 'Vorschau', 'Görsel': 'Bild', 'Müzik': 'Musik', 'Video': 'Video', 'Müzik/Ses': 'Musik/Sound', 'Dinle': 'Anhören', 'Kopyala': 'Kopieren', 'Kitaplık yükleniyor…': 'Bibliothek wird geladen…', 'Kitaplık henüz boş. Sohbette ya da Üretim havuzunda görsel, müzik veya video üret; hepsi burada birikecek.': 'Die Bibliothek ist noch leer. Erstelle im Chat oder in der Erstellungs-Galerie ein Bild, Musik oder ein Video – alles sammelt sich hier.', 'Prompt ve motor bilgisi': 'Prompt- und Motor-Info', 'Bilgi: prompt ve motor': 'Info: Prompt und Motor', 'Kitaplık görseli': 'Bibliotheksbild',
            'Model seç': 'Modell wählen', 'Komut seç': 'Befehl wählen', 'Kaydı başlat/durdur': 'Aufnahme starten/stoppen',
            'Mikrofonu aç/kapat': 'Mikrofon an/aus', 'Sohbeti bitir': 'Chat beenden', 'NesilAI logosu': 'NesilAI-Logo',
            'Kendini tanıt': 'Vorstellen', 'NesilAI Bilgileri': 'Über NesilAI', 'Sesli sohbet': 'Sprachchat',
            'Yapay zeka motoru, gizlilik ve kullanım kılavuzu — hepsi burada.': 'KI-Engine, Datenschutz und Anleitung — alles hier.',
            'NesilAI nedir?': 'Was ist NesilAI?', 'Gizlilik: verileriniz nerede?': 'Datenschutz: Wo sind Ihre Daten?',
            'Yapay zeka motoru': 'KI-Engine', 'Kullanım kılavuzu': 'Anleitung', 'Sosyal medya': 'Soziale Medien', 'Üç ilke': 'Drei Grundsätze', 'Gizlilik & Güvenlik': 'Datenschutz & Sicherheit', 'Kullanıcı Sözleşmesi': 'Nutzungsvereinbarung',
            "Instagram'da takip et": 'Folge uns auf Instagram', 'Tarafından Bloodline INC.': 'Von Bloodline INC.',
            'Yapay zeka sohbetinden bağımsız üretim atölyesi — üret, dinle, indir.': 'Erstellungswerkstatt unabhängig vom KI-Chat — erstellen, anhören, herunterladen.',
            'NesilAI, Bloodline üzerinde çalışan bir yapay zeka asistanıdır; Acsida tarafından geliştirilmiştir. Sohbet, görsel üretimi, ses↔yazı ve': 'NesilAI ist ein KI-Assistent auf Bloodline; entwickelt von Acsida. Chat, Bilderstellung, Sprache↔Text und',
            'ekran asistanı gibi yetenekleri vardır. OpenView yalnızca bilgisayar uygulamasında ayrı bir pencere olarak çalışır; web sürümünde ayrı bir PiP penceresi açar.': 'der Screen-Assistent OpenView. OpenView läuft nur in der PC-App als eigenes Fenster; im Web öffnet sich ein PiP-Fenster.',
            'Loglar ve sohbetler': 'Protokolle und Chats', "'nda tutulur — sunucuya gönderilmez.": '— und werden nicht an einen Server gesendet.',
            '(Kendini Tanıt bilgileri) cihazınızda şifrelenmiş alan adında tutulur; hiçbir arayüzde gösterilmez.': '(Vorstellen-Daten) werden verschlüsselt auf dem Gerät gespeichert; nirgends angezeigt.',
            'OpenView ekran görüntüleri': 'OpenView-Screenshots',
            'yalnızca sorduğunuz anda alınır, yanıt verdikten sonra atılır; kalıcı saklanmaz.': 'werden nur auf Anfrage aufgenommen und nach der Antwort verworfen; keine Speicherung.',
            'Üretim görselleri/müzik/videolar': 'Erstellte Bilder/Musik/Videos',
            "IndexedDB'de saklanır; sohbeti silmek bunları da silmez.": 'liegen in IndexedDB; Löschen des Chats entfernt sie nicht.',
            'Sohbet: ücretsiz, anahtarsız NesilAI YZ — limitte otomatik yedek motora geçer.': 'Chat: kostenloses NesilAI YZ ohne Schlüssel — bei Limit Wechsel zum Backup-Motor.',
            "Görsel: Pollinations + AI Horde (bağımsız yedek) — Türkçe promptlar otomatik İngilizce'ye çevrilir.": 'Bilder: Pollinations + AI Horde (unabhängiger Backup) — türkische Prompts werden automatisch ins Englische übersetzt.',
            'Ses: Web Speech API; çalışmazsa cihazınızda çalışan yerel Whisper modeli devreye girer.': 'Sprache: Web Speech API; falls nicht verfügbar, übernimmt das lokale Whisper-Modell.',
            '(ekran asistanı), ': '(Screen-Assistent), ', '(insan gibi yazma), ': '(menschliches Schreiben), ',
            'yeni sohbette adını, yaşını, ilgi alanlarını yaz — AI artık sana özel konuşur (gizli belleğe yazılır).': 'schreibe im neuen Chat Name, Alter, Interessen — die KI spricht persönlich (im versteckten Gedächtnis gespeichert).',
            'mesaj kutusuna ne istediğini yaz; "görsel oluştur" gibi ifadeler otomatik görsel moduna geçer.': 'schreibe ins Nachrichtenfeld, was du willst; Formulierungen wie „Bild erstellen“ wechseln in den Bildmodus.',
            'birden çok görseli/müziği tek seferde üret, sonuçları galeriden yönet.': 'mehrere Bilder/Musikstücke auf einmal erstellen, Ergebnisse in der Galerie verwalten.',
            'OpenView için': 'für OpenView', "(Ayarlar'dan değiştirilebilir).": '(in den Einstellungen änderbar).',
            'Otomatik (ekran genişliğine göre)': 'Automatisch (nach Bildschirmbreite)',
            'Telefon — kompakt tek kolon, büyük dokunma hedefleri': 'Telefon — kompakte Spalte, große Schaltflächen',
            'Masaüstü — tam arayüz': 'PC — volle Oberfläche',
            'Telefon modunda renkler, yazı boyutları ve dokunma alanları tamamen telefona göre ayarlanır; hangi ekranda olursan ol telefon düzeninde kalır.': 'Im Telefonmodus sind Farben, Schriftgrößen und Schaltflächen aufs Telefon abgestimmt; auf jedem Bildschirm bleibt die Telefonansicht.',
            'NesilAI YZ (ücretsiz — anahtar yok)': 'NesilAI YZ (kostenlos — ohne Schlüssel)',
            'Google Gemini (AI Studio anahtarı)': 'Google Gemini (AI-Studio-Schlüssel)',
            'Groq Cloud (ücretsiz kota)': 'Groq Cloud (kostenloses Kontingent)',
            'OpenRouter (ücretsiz modeller var)': 'OpenRouter (kostenlose Modelle verfügbar)',
            'OpenAI (kendi anahtarınla)': 'OpenAI (eigener Schlüssel)',
            'Özel uç nokta (OpenAI uyumlu)': 'Eigener Server (OpenAI-kompatibel)',
            'Otomatik (kullanıcının dili)': 'Automatisch (Sprache des Nutzers)',
            'Rusça': 'Russisch', 'Türkçe': 'Türkisch', 'İspanyolca': 'Spanisch', 'Hintçe': 'Hindi', 'Almanca': 'Deutsch', 'İngilizce': 'Englisch',
            'Otomatik (yanıt dilini izle)': 'Automatisch (wie Antwortsprache)',
            '✏️ Diğer dili kendin seç…': '✏️ Andere Sprache — selbst wählen…',
            'Genel amaçlı, uzun bağlam (180K)': 'Allgemein, langer Kontext (180K)',
            'Kod için optimize': 'Optimiert für Code', 'Hızlı, 400K bağlam': 'Schnell, 400K Kontext', 'Hafif ve hızlı': 'Leicht und schnell',
            'Yanıt yazılıyor': 'Antwort wird geschrieben', 'İnternette araştırılıyor': 'Im Internet wird recherchiert', 'Mimari plan çıkarılıyor': 'Plan wird erstellt', 'çalışıyor': 'läuft',
            'Yapay zekadan yanıt alınamadı.': 'KI-Antwort konnte nicht abgerufen werden.', 'Bilinmeyen hata': 'Unbekannter Fehler',
            'Yapay zekadan yanıt alınamadı': 'KI-Antwort konnte nicht abgerufen werden', 'Yapay zeka kaynağı yeniden ayarlanmalı': 'KI-Quelle muss neu eingerichtet werden',
            'Ayarlar → Yapay Zeka bölümünden bir sağlayıcı seçip anahtarını ekle, ardından ': 'Wähle in Einstellungen → KI einen Anbieter, füge den Schlüssel hinzu und nutze ',
            ' butonunu kullan.': 'die Prüfschaltfläche.',
            'Anahtar geçersiz görünüyor. Ayarlar → Yapay Zeka bölümünden güncelleyip ': 'Schlüssel scheint ungültig. Aktualisiere ihn in Einstellungen → KI und prüfe mit ',
            ' ile doğrula.': '.',
            'Aktif sağlayıcı: ': 'Aktiver Anbieter: ',
            '. Ayarlar → Yapay Zeka bölümünden başka bir sağlayıcı ya da model seçmeyi dene.': '. Wähle in Einstellungen → KI einen anderen Anbieter oder ein anderes Modell.',
            'Bağlantını kontrol edip tekrar dene. Ağ engelleyicin isteği durduruyor olabilir.': 'Prüfe die Verbindung und versuche es erneut. Netzwerk/Blocker könnte die Anfrage stoppen.',
            'Tekrar deneyebilir ya da Ayarlar → Yapay Zeka bölümünden ': 'Versuche es erneut oder wähle in Einstellungen → KI für ',
            ' için farklı bir model seçebilirsin.': ' ein anderes Modell.',
            'Bu isimde komut yok — yazmaya devam et, normal mesaj olarak gönderilir.': 'Diesen Befehl gibt es nicht — schreibe weiter; wird als normale Nachricht gesendet.',
            '{n} kayıtlı bilgi · cihazında saklanıyor': '{n} gespeicherte Infos · auf dem Gerät',
            '{n} ses kullanılabilir ({k} Türkçe) — tüm diller listelenir; tarayıcının desteklediği sesler cihazına göre değişir.': '{n} Stimmen verfügbar ({k} türkische) — vollständige Liste; verfügbarer Stimmen je nach Browser/Gerät.',
            'Yanıtları otomatik olarak seslendir': 'Antworten automatisch vorlesen',
            'Bildirim sesleri — yanıt gelince iMessage tarzı çal': 'Benachrichtigungstöne — im iMessage-Stil bei Antwort',
            'Göster': 'Anzeigen', 'Gizle': 'Verbergen',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler (on/off)': 'Ehrlichkeitsmodus — kein Lob; wenn eine Idee nichts taugt, sagt er es klar (an/aus)',
            'Dürüstlük modu açık. Bundan sonra süsleme yok: fikir kötüyse "tutmaz" derim, riskleri baştan söylerim, yapılabileceğini sanmıyorsam açıkça söylerim. Övgü yerine gerçek değerlendirim olur.': 'Ehrlichkeitsmodus aktiv. Kein Kitsch mehr: Ist eine Idee schlecht, sage ich „taugt nichts“, nenne die Risiken vorab; halte ich etwas für unmöglich, sage ich es offen. Statt Lob: echte Einschätzung.',
            'Dürüstlük modu kapandı. Standart asistan tonuna döndüm.': 'Ehrlichkeitsmodus aus. Zurück zum Standardton.',
            'ACSMOD açık (geliştirici modu). Gereksiz uyarı ve moral dersi yok; teknik konuları doğrudan anlatırım. Yasadışı ya da zarar verici işler yine olmaz — o kısımları reddederim.': 'ACSMOD aktiv (Entwicklermodus). Keine überflüssigen Warnungen und Moralpredigten; technische Themen direkt erklärt. Illegales oder Schädliches bleibt abgelehnt.',
            'ACSMOD kapandı. Standart tona döndüm.': 'ACSMOD aus. Zurück zum Standardton.',
            'Motor sağlık testi çalışıyor…': 'Motoren-Gesundheitsprüfung läuft…',
            'Sohbet motoru: ÇALIŞIYOR': 'Chat-Engine: FUNKTIONIERT',
            'Sohbet motoru: HATA': 'Chat-Engine: FEHLER',
            'Görsel motoru: ÇALIŞIYOR': 'Bild-Engine: FUNKTIONIERT',
            'Görsel motoru: HATA': 'Bild-Engine: FEHLER',
            'zaman aşımı': 'Zeitüberschreitung',
            'bilinmeyen hata': 'unbekannter Fehler',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler, riskleri gizlemez': 'Ehrlichkeitsmodus — kein Lob; sagt klar, wenn eine Idee nichts taugt, und verschweigt keine Risiken'
        },

        en: {
            '[yerel]': '[Local]',
            '[çevrimiçi]': '[Online]',
            'Kaydet': 'Save',
            'Örnek: Ollama': 'Example: Ollama',
            'LM Studio': 'LM Studio',
            'Ayrıca sohbete': 'Also in chat',
            'yazarak da açıp kapatabilirsin.': 'to toggle it by typing in chat.',
            'Yeni sohbet': 'New chat',
            'Kendini Tanıt': 'Introduce Yourself',
            'Sohbetler': 'Chats',
            'Bilgiler': 'About',
            'Ücretsiz Plan': 'Free Plan',
            'Free Plan': 'Free Plan',
            'Ücretsiz': 'Free',
            'Üretim havuzu': 'Creation Pool',
            'Ayarlar': 'Settings',
            'NesilAI ile çalışmaya başla': 'Get started with NesilAI',
            'Gerçek bir yapay zeka modeliyle sohbet et, görsel oluştur, sesini yazıya çevir ve yüklediğin görselleri okut.': 'Chat with a real AI model, create images, turn speech into text and analyze uploaded images.',
            'Aktif kaynak:': 'Active provider:',
            'Kaynağı değiştir': 'Change provider',
            'Anahtarını ekle': 'Add your key',
            'Görsel oluştur': 'Create image',
            'Neon ışıklı siberpunk bir şehir': 'A neon-lit cyberpunk city',
            'Asistanı tanı': 'Meet the assistant',
            'Neler yapabildiğini anlat': 'Tell me what you can do',
            'Kod yaz': 'Write code',
            'JavaScript todo uygulaması': 'JavaScript todo app',
            'Yazı üret': 'Generate text',
            'Yapay zekanın geleceği': 'The future of AI',
            'Ara': 'Search',
            'Model ara…': 'Search models…',
            'Kendi API anahtarını eklemek için Ayarlar → Yapay Zeka.': 'To add your own API key: Settings → AI.',
            'Seçtiğin mod, gönderdiğin her mesajı o türde üretir.': 'The selected mode turns every message you send into that kind of output.',
            'Komutu seç ya da yazmaya devam et — boşluk bırakınca talimatını ekleyebilirsin.': 'Pick a command or keep typing — add a space to append your instructions.',
            'Görsel yükle': 'Upload image',
            'Görsel yükle ve metnini okut': 'Upload an image and read its text',
            'Sesle yaz': 'Dictate',
            'Yanıtı durdur': 'Stop response',
            'Gönder': 'Send',
            'Bir mesaj yaz…': 'Type a message…',
            'Enter ile gönder · Shift+Enter ile satır atla · Yanıtlar hatalı olabilir, önemli bilgileri doğrula': 'Enter to send · Shift+Enter for a new line · Responses may be wrong; verify important info',
            'Sağlayıcı ayarla': 'Set provider',
            'anahtar gerekli': 'key required',
            '(kurulum gerekli)': '(setup required)',
            'Menüyü aç/kapat': 'Toggle menu',
            'Tema değiştir': 'Switch theme',
            'Açık/koyu tema': 'Light/dark theme',
            'Sesli': 'Voice',
            'Model': 'Model',
            'Sohbet': 'Chat',
            'Normal yapay zeka sohbeti': 'Normal AI chat',
            'Görsel üret': 'Create image',
            'Yazdığın tarif görsel olur': 'Your description becomes an image',
            'Müzik / Ses': 'Music / Audio',
            'Şarkı, enstrümantal veya seslendirme': 'Song, instrumental or speech',
            'aktif': 'active',
            'Mod: {m} — yazdığın her şey {m} olarak üretilcek': 'Mode: {m} — everything you type will be generated as {m}',
            'NesilAI YZ · {m} seçildi': 'NesilAI AI · {m} selected',
            'Ayarlar kaydedildi': 'Settings saved',
            'Yapay zeka sağlayıcısı, ses ve veri seçenekleri.': 'AI provider, voice and data options.',
            'Yapay zeka': 'Artificial intelligence',
            'Sağlayıcı': 'Provider',
            'NesilAI YZ modeli': 'NesilAI AI model',
            'Minimax, Codestral, GLM, Mistral Nemo — anahtarsız çalışır.': 'Minimax, Codestral, GLM, Mistral Nemo — works without a key.',
            'Anahtarsız çalışır; modeli istediğin an değiştirebilirsin. Değişiklik anında kaydedilir.': 'Works keyless; change the model anytime. Changes save instantly.',
            'Listeden seçebilir ya da model adını elle yazabilirsin.': 'Pick from the list or type a model name manually.',
            'API anahtarı': 'API key',
            'Anahtarını buraya yapıştır': 'Paste your key here',
            'Göster': 'Show',
            'API anahtarı al ↗': 'Get an API key ↗',
            'Anahtar yalnızca bu tarayıcının localStorage alanında tutulur, hiçbir sunucuya gönderilmez.': 'Your key stays in this browser\'s localStorage; it is never sent to any server.',
            'Sunucu adresi (OpenAI uyumlu)': 'Server URL (OpenAI-compatible)',
            'Yaratıcılık (temperature)': 'Creativity (temperature)',
            'Düşük değer daha kesin, yüksek değer daha yaratıcı yanıt üretir.': 'Low values are more precise, high values more creative.',
            'Bağlantıyı test et': 'Test connection',
            'Bağlantı test ediliyor...': 'Testing connection...',
            'Kendi anahtarını kullanmak, hesapların ve kotaların sana ait olmasını sağlar. Başkasının yayınladığı anahtarlar güvenlik ihlali olur ve çalışmaz — denemek için ücretsiz katman sunan sağlayıcıları (Gemini, Groq, OpenRouter) kullan.': 'Using your own key keeps accounts and quotas yours. Keys published by others are a security risk and won\'t work — for testing use providers with a free tier (Gemini, Groq, OpenRouter).',
            'Dil Seçme': 'Language',
            'Yanıt dili': 'Response language',
            'Yapay zeka, seçtiğin dilde yanıt verir. "Otomatik" seçersen hangi dilde yazarsan o dilde yanıtlar.': 'The AI answers in the selected language. With "Auto" it replies in whatever language you write.',
            'Diğer dil — kendin seç': 'Other language — pick your own',
            'Listede olmayan herhangi bir dilin adını yaz; yapay zeka o dilde yanıtlar.': 'Type any language name not in the list; the AI will answer in it.',
            'Arayüz dili': 'Interface language',
            'Menülerin ve düğmelerin dili. "Otomatik" seçiliyse yanıt dilini izler.': 'Language of menus and buttons. With "Auto" it follows the response language.',
            'Ses': 'Voice',
            'Seslendirici': 'Voice',
            'Konuşma hızı': 'Speech rate',
            'Ses tonu': 'Pitch',
            'Bellek': 'Memory',
            'Kalıcı bellek açık — adın, projelerin ve tercihleriniz yeni sohbetlerde hatırlanır': 'Persistent memory on — your name, projects and preferences are remembered in new chats',
            'Tüm belleği temizle': 'Clear all memory',
            'Veri': 'Data',
            'Tüm sohbet geçmişini sil': 'Delete all chat history',
            'Yanıt Stili': 'Response Style',
            'İnsan gibi yaz — AI-Slop\\\'u kapat (kalıp cümleler, boş nezaket, liste yığını yok)': 'Write like a human — turn off AI-Slop (no clichés, empty politeness or wall-of-lists)',
            'Görünüm': 'Appearance',
            'Cihaz modu': 'Device mode',
            'Kaydet ve kapat': 'Save & close',
            'Sistem sesleri yükleniyor…': 'Loading system voices…',
            'Henüz kayıtlı bilgi yok. Sohbet ederken "adım Alperen" gibi kalıcı bilgiler yazarsan burada görünür.': 'Nothing stored yet. Write permanent facts like "my name is Alperen" while chatting and they appear here.',
            'Sil': 'Delete',
            'Sohbet silindi': 'Chat deleted',
            'Galeri temizlendi': 'Gallery cleared',
            'Üretim havuzu: görseller hazır': 'Creation pool: images ready',
            'En azından adını yaz — gerisi isteğe bağlı': 'At least write your name — the rest is optional',
            'Gizli bellek güncellendi — artık seni tanıyorum': 'Secret memory updated — I know you now',
            'Gizli bellek kaydedilemedi': 'Couldn\'t save secret memory',
            'Gizli bellek temizlendi': 'Secret memory cleared',
            'Yanıt durduruldu': 'Response stopped',
            'Konuşma tanıma desteklenmiyor': 'Speech recognition not supported',
            'Kayıt durduruldu': 'Recording stopped',
            'Sizi dinliyorum, konuşabilirsiniz...': 'I\'m listening, go ahead...',
            'Mikrofon izni reddedildi — adres çubuğundaki kilit/izn menüsünden izin ver': 'Microphone permission denied — allow it from the lock/permission menu in the address bar',
            'Konuşma tanıma servisine ulaşılamadı': 'Couldn\'t reach the speech recognition service',
            'Mikrofon açılamadı': 'Couldn\'t open the microphone',
            'Sesli sohbet bu tarayıcıda tam desteklenmiyor': 'Voice chat isn\'t fully supported in this browser',
            'Lütfen bir resim dosyası seçin': 'Please choose an image file',
            'Görsel başarıyla analiz edildi': 'Image analyzed successfully',
            'Seslendirme başlatılamadı': 'Couldn\'t start speech synthesis',
            'Mikrofon hatası: {c}': 'Microphone error: {c}',
            'Derin düşünür, detaylı araştırıp yanıtlar': 'Thinks deeply, researches in detail and answers',
            'İnternette derin araştırma yapıp rapor hazırlar': 'Deep-researches the web and prepares a report',
            'Araştırır, plan çıkarır, kod yazar': 'Researches, plans and writes code',
            'Kodlama ajanı — dosyaları okur, yazar, oluşturur, siler (on/off)': 'Coding agent — reads, writes, creates and deletes files (on/off)',
            'Ekranını canlı izlet — PC ekran asistanı (on/off/settings)': 'Share your screen live — PC screen assistant (on/off/settings)',
            'AI-Slop\\\'u kapat — insan gibi konuşur (on/off)': 'Turn off AI-Slop — talks like a human (on/off)',
            'Ayarlar panelini açar (sağlayıcı, model, ses, veri)': 'Opens the settings panel (provider, model, voice, data)',
            'Açık/koyu temayı değiştirir': 'Toggles the light/dark theme',
            'Sesli sohbet modunu açar': 'Opens voice chat mode',
            'Tüm sohbet geçmişini siler': 'Deletes all chat history',
            'Tüm komutları listeler': 'Lists all commands',
            'Tüm komutları listeler (/yardim ile aynı)': 'Lists all commands (same as /yardim)',
            'Komutlar: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim': 'Commands: /ultrathink /report /ultracode /ayarlar /tema /ses /temizle /yardim',
            'Yanıt verirken internette araştırma yap': 'Search the web while answering',
            'NesilAI YZ modelini değiştir': 'Change the NesilAI AI model',
            'Üretim modu seç': 'Choose generation mode',
            'Ücretsiz hız anahtarı (isteğe bağlı)': 'Free speed key (optional)',
            'Ücretsiz hız anahtarı al ↗': 'Get a free speed key ↗',
            'İsteğe bağlı: alırsan hız limitin yükselir; anahtarsız da çalışır.': 'Optional: raises your rate limit; works without it too.',
            'Anahtar eklendi — limitin yükseltildi': 'Key added — your limit was raised',
            'NesilAI YZ yoğun — otomatik yedek motora geçildi': 'NesilAI AI is busy — switched to the backup engine',
            'Uygulamayı indir': 'Download the app',
            'Android uygulaması': 'Android app',
            'Bilgisayar uygulaması': 'Desktop app',
            'Kapat': 'Close',
            'Eki kaldır': 'Remove attachment',
            'Mesaj': 'Message',
            'Kenar çubuğu': 'Sidebar',
            'Kitaplık': 'Library',
            'Üretilen tüm görsel, müzik ve videolar burada birikir.': 'All your generated images, music and videos collect here.',
            'Tümü': 'All',
            'Görseller': 'Images',
            'Müzik & Ses': 'Music & Audio',
            'Videolar': 'Videos',
            'Üretim bilgisi': 'Generation info',
            'Motor': 'Engine',
            'Tarih': 'Date',
            'Prompt': 'Prompt',
            'İndir': 'Download',
            'Ön izle': 'Preview',
            'Görsel': 'Image',
            'Müzik': 'Music',
            'Video': 'Video',
            'Müzik/Ses': 'Music/Audio',
            'Dinle': 'Listen',
            'Kopyala': 'Copy',
            'Kitaplık yükleniyor…': 'Loading library…',
            'Kitaplık henüz boş. Sohbette ya da Üretim havuzunda görsel, müzik veya video üret; hepsi burada birikecek.': 'The library is still empty. Generate an image, music or a video in a chat or in the Creation Pool; everything will collect here.',
            'Prompt ve motor bilgisi': 'Prompt and engine info',
            'Bilgi: prompt ve motor': 'Info: prompt and engine',
            'Kitaplık görseli': 'Library image',
            'Model seç': 'Choose model',
            'Komut seç': 'Choose command',
            'Kaydı başlat/durdur': 'Start/stop recording',
            'Mikrofonu aç/kapat': 'Mute/unmute microphone',
            'Sohbeti bitir': 'End chat',
            'NesilAI logosu': 'NesilAI logo',
            'Kendini tanıt': 'Introduce yourself',
            'NesilAI Bilgileri': 'About NesilAI',
            'Sesli sohbet': 'Voice chat',
            'Yapay zeka motoru, gizlilik ve kullanım kılavuzu — hepsi burada.': 'AI engine, privacy and user guide — all here.',
            'NesilAI nedir?': 'What is NesilAI?',
            'Gizlilik: verileriniz nerede?': 'Privacy: where is your data?',
            'Yapay zeka motoru': 'AI engine',
            'Kullanım kılavuzu': 'User guide', 'Üç ilke': 'Three principles', 'Gizlilik & Güvenlik': 'Privacy & Security', 'Kullanıcı Sözleşmesi': 'User Agreement',
            'Sosyal medya': 'Social media',
            'Yapay zeka sohbetinden bağımsız üretim atölyesi — üret, dinle, indir.': 'A creation workshop independent of AI chat — create, listen, download.',
            'NesilAI, Bloodline üzerinde çalışan bir yapay zeka asistanıdır; Acsida tarafından geliştirilmiştir. Sohbet, görsel üretimi, ses↔yazı ve': 'NesilAI is an AI assistant running on Bloodline; developed by Acsida. It offers chat, image generation, speech↔text and',
            'ekran asistanı gibi yetenekleri vardır. OpenView yalnızca bilgisayar uygulamasında ayrı bir pencere olarak çalışır; web sürümünde ayrı bir PiP penceresi açar.': 'screen-assistant capabilities. OpenView runs as a separate window only in the desktop app; the web version opens a separate PiP window.',
            'Loglar ve sohbetler': 'Logs and chats',
            'tarayıcınızın': 'your browser\'s',
            '(Kendini Tanıt bilgileri) cihazınızda şifreli alan adında tutulur; hiçbir arayüzde gösterilmez.': '(Introduce Yourself info) is kept in an encrypted area on your device; never shown in any interface.',
            'OpenView ekran görüntüleri': 'OpenView screenshots',
            'yalnızca sorduğunuz anda alınır, yanıt verdikten sonra atılır; kalıcı saklanmaz.': 'are taken only when you ask and discarded after answering; never stored permanently.',
            'Üretim görselleri/müzik/videolar': 'Generated images/music/videos',
            'Sohbet: ücretsiz, anahtarsız NesilAI YZ — limitte otomatik yedek motora geçer.': 'Chat: free, keyless NesilAI AI — falls back to a backup engine at the limit.',
            'Ses: Web Speech API; çalışmazsa cihazınızda çalışan yerel Whisper modeli devreye girer.': 'Voice: Web Speech API; if unavailable, a local Whisper model on your device takes over.',
            '(ekran asistanı),': '(screen assistant),',
            '(insan gibi yazma),': '(human-like writing),',
            'yeni sohbette adını, yaşını, ilgi alanlarını yaz — AI artık sana özel konuşur (gizli belleğe yazılır).': 'write your name, age and interests in a new chat — the AI now talks just for you (saved to secret memory).',
            'mesaj kutusuna ne istediğini yaz; "görsel oluştur" gibi ifadeler otomatik görsel moduna geçer.': 'type what you want in the message box; phrases like "create an image" switch to image mode automatically.',
            'birden çok görseli/müziği tek seferde üret, sonuçları galeriden yönet.': 'generate multiple images/music tracks at once and manage results from the gallery.',
            'OpenView için': 'For OpenView',
            'Otomatik (ekran genişliğine göre)': 'Auto (by screen width)',
            'Telefon — kompakt tek kolon, büyük dokunma hedefleri': 'Phone — compact single column, large touch targets',
            'Masaüstü — tam arayüz': 'Desktop — full interface',
            'Telefon modunda renkler, yazı boyutları ve dokunma alanları tamamen telefona göre ayarlanır; hangi ekranda olursan ol telefon düzeninde kalır.': 'In phone mode colors, font sizes and touch targets are tuned for phones; you stay in the phone layout on any screen.',
            'NesilAI YZ (ücretsiz — anahtar yok)': 'NesilAI AI (free — no key)',
            'Google Gemini (AI Studio anahtarı)': 'Google Gemini (AI Studio key)',
            'Groq Cloud (ücretsiz kota)': 'Groq Cloud (free quota)',
            'OpenRouter (ücretsiz modeller var)': 'OpenRouter (free models available)',
            'OpenAI (kendi anahtarınla)': 'OpenAI (your own key)',
            'Özel uç nokta (OpenAI uyumlu)': 'Custom endpoint (OpenAI-compatible)',
            'Otomatik (kullanıcının dili)': 'Auto (user\'s language)',
            'Rusça': 'Russian',
            'Türkçe': 'Turkish',
            'İspanyolca': 'Spanish',
            'Hintçe': 'Hindi',
            'Almanca': 'German',
            'İngilizce': 'English',
            'Otomatik (yanıt dilini izle)': 'Auto (follow response language)',
            '✏️ Diğer dili kendin seç…': '✏️ Pick another language…',
            'Genel amaçlı, uzun bağlam (180K)': 'General purpose, long context (180K)',
            'Kod için optimize': 'Optimized for code',
            'Hızlı, 400K bağlam': 'Fast, 400K context',
            'Hafif ve hızlı': 'Light and fast',
            'Yanıt yazılıyor': 'Writing response',
            'İnternette araştırılıyor': 'Researching the web',
            'Mimari plan çıkarılıyor': 'Drafting an architecture plan',
            'çalışıyor': 'running',
            'Yapay zekadan yanıt alınamadı.': 'Couldn\'t get a response from the AI.',
            'Bilinmeyen hata': 'Unknown error',
            'Yapay zekadan yanıt alınamadı': 'Couldn\'t get a response from the AI',
            'Yapay zeka kaynağı yeniden ayarlanmalı': 'The AI provider must be set again',
            'Ayarlar → Yapay Zeka bölümünden bir sağlayıcı seçip anahtarını ekle, ardından': 'Pick a provider in Settings → AI, add your key, then use the',
            ' butonunu kullan.': ' button.',
            'Anahtar geçersiz görünüyor. Ayarlar → Yapay Zeka bölümünden güncelleyip': 'Your key looks invalid. Update it in Settings → AI and verify with',
            ' ile doğrula.': ' .',
            'Aktif sağlayıcı: ': 'Active provider: ',
            '. Ayarlar → Yapay Zeka bölümünden başka bir sağlayıcı ya da model seçmeyi dene.': '. Try another provider or model in Settings → AI.',
            'Bağlantını kontrol edip tekrar dene. Ağ engelleyicin isteği durduruyor olabilir.': 'Check your connection and try again. A network blocker may have stopped the request.',
            'Tekrar deneyebilir ya da Ayarlar → Yapay Zeka bölümünden ': 'You can retry or, in Settings → AI, pick a different model for ',
            ' için farklı bir model seçebilirsin.': ' .',
            'Bu isimde komut yok — yazmaya devam et, normal mesaj olarak gönderilir.': 'No command with this name — keep typing; it will be sent as a normal message.',
            '{n} kayıtlı bilgi · cihazında saklanıyor': '{n} stored facts · kept on your device',
            '{n} ses kullanılabilir ({k} Türkçe) — tüm diller listelenir; tarayıcının desteklediği sesler cihazına göre değişir.': '{n} voices available ({k} Turkish) — all languages listed; available voices vary by browser/device.',
            'Yanıtları otomatik olarak seslendir': 'Read responses aloud automatically',
            'Bildirim sesleri — yanıt gelince iMessage tarzı çal': 'Notification sounds — iMessage-style chime on response',
            'Gizle': 'Hide',
            'İsteğe bağlı hız anahtarı: token.llm7.io — limiti yükseltir, zorunlu değildir.': 'Optional speed key: token.llm7.io — raises limits, not required.',
            'Anahtarsız çalışır (günlük ~1M token). Modeli aşağıdan seçebilirsin.': 'Works keyless (~1M tokens/day). Choose the model below.',
            'API anahtarı gerekmez.': 'No API key required.',
            'Görsel okuma (vision) desteklenir.': 'Image reading (vision) supported.',
            'Google AI Studio ücretsiz katmanı: kredi kartı istemez.': 'Google AI Studio free tier: no credit card.',
            'Groq ücretsiz katmanı çok hızlıdır (LPU).': 'The Groq free tier is very fast (LPU).',
            'Sonu \\":free\\" ile biten modeller ücretsizdir.': 'Models ending in \\":free\\" are free.',
            'OpenAI ücretsiz katman sunmaz; kullanım için bakiye gerekir.': 'OpenAI offers no free tier; balance required.',
            'Ollama, LM Studio, vLLM, DeepSeek, Mistral… OpenAI uyumlu her sunucu.': 'Ollama, LM Studio, vLLM, DeepSeek, Mistral… any OpenAI-compatible server.',
            'Anahtarsız, ücretsiz NesilAI motoru. Gerçek modeli aşağıdan seç.': 'Free keyless NesilAI engine. Pick the real model below.',
            'Instagram\\\'da takip et': 'Follow on Instagram',
            'Tarafından Bloodline INC.': 'By Bloodline INC.',
            '\\\'nda tutulur — sunucuya gönderilmez.': ' — not sent to a server.',
            'IndexedDB\\\'de saklanır; sohbeti silmek bunları da silmez.': 'stored in IndexedDB; deleting the chat doesn\'t remove them.',
            'Görsel: Pollinations + AI Horde (bağımsız yedek) — Türkçe promptlar otomatik İngilizce\\\'ye çevrilir.': 'Images: Pollinations + AI Horde (independent backup) — Turkish prompts are auto-translated to English.',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler (on/off)': 'TRUSTME mode — no flattery; says plainly when an idea will not fly (on/off)',
            'Dürüstlük modu açık. Bundan sonra süsleme yok: fikir kötüyse "tutmaz" derim, riskleri baştan söylerim, yapılabileceğini sanmıyorsam açıkça söylerim. Övgü yerine gerçek değerlendirim olur.': 'TRUSTME mode on. No sugarcoating: if an idea is weak I will say "it will not fly", flag the risks upfront, and state plainly when something is not feasible. Real assessment instead of praise.',
            'Dürüstlük modu kapandı. Standart asistan tonuna döndüm.': 'TRUSTME mode off. Back to the standard tone.',
            'ACSMOD açık (geliştirici modu). Gereksiz uyarı ve moral dersi yok; teknik konuları doğrudan anlatırım. Yasadışı ya da zarar verici işler yine olmaz — o kısımları reddederim.': 'ACSMOD on (developer mode). No needless warnings or moral lectures; technical topics explained directly. Illegal or harmful requests are still refused.',
            'ACSMOD kapandı. Standart tona döndüm.': 'ACSMOD off. Back to the standard tone.',
            'Motor sağlık testi çalışıyor…': 'Running engine health check…',
            'Sohbet motoru: ÇALIŞIYOR': 'Chat engine: OK',
            'Sohbet motoru: HATA': 'Chat engine: ERROR',
            'Görsel motoru: ÇALIŞIYOR': 'Image engine: OK',
            'Görsel motoru: HATA': 'Image engine: ERROR',
            'zaman aşımı': 'timed out',
            'bilinmeyen hata': 'unknown error',
            'Dürüstlük modu — övgü yok; fikir tutmuyorsa açıkça söyler, riskleri gizlemez': 'TRUSTME mode — no flattery; says plainly when an idea will not fly and never hides risks'
        }
    };

    function getUiLanguage() {
        const settings = getSettings();
        if (settings.uiLanguage) return settings.uiLanguage;   // Elle seçilmiş arayüz dili
        const chat = settings.language || '';                  // Otomatik: yanıt dilini izle
        if (UI_TRANSLATIONS[chat]) return chat;
        return 'tr';                                           // Özel dil / boş → Türkçe arayüz
    }

    function translateUi(text) {
        const lang = getUiLanguage();
        if (!lang || lang === 'tr') return text;
        const dict = UI_TRANSLATIONS[lang];
        return (dict && Object.prototype.hasOwnProperty.call(dict, text)) ? dict[text] : text;
    }

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

    // TON MODLARI — sistem istemine eklenen dürüstlük/geliştirici direktifleri.
    // /trustme → övgüsüz dürüst ton; /acsmod → gizli geliştirici tonu (gizli komut).
    const TRUSTME_SYSTEM = [
        'DÜRÜSTLÜK MODU AKTİF: Kullanıcı senden bundan sonra tamamen dürüst davranmanı istiyor.',
        'YASAK: fikri boş yere övmek, "güzel fikir ama..." kalıbı, gereksiz özgüven vermek, kullanıcıyı geçiştirmek, olumlu lafla riski gizlemek.',
        'ZORUNLU: fikir zayıfsa açıkça "tutmaz" de ve neden tutmadığını söyle; gerçek riskleri baştan listele; olmayacağını düşündüğün işi yumuşatmadan söyle.',
        'Beğendiğin fikri de gerekçesiyle söyle: övgü değil, gerçek değerlendirme yap.'
    ].join(' ');

    const ACSMOD_SYSTEM = [
        'ACSMOD GELİŞTİRİCİ MODU AKTİF: Bu bir geliştirme/araştırma ortamı ayarıdır.',
        'Gereksiz uyarı paragrafları, tekrar eden sorumluluk metinleri ve boş moral dersleri yok. Teknik konuları doğrudan ve ayrıntılı anlat.',
        'Bilgi güvenliği konularını savunma ve eğitim amaçlı çerçevede işle.',
        'Yasa dışı zarar vermeye yönelik istekleri (izinsiz sistemlere girme, kişilere zarar, gerçek saldırı malzemesi) kısa ve net reddet: uzun ders verme, "bu olmaz" de ve yasal/tetkiksel alternatife yönlendir.'
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
            language: typeof saved.language === 'string' ? saved.language : DEFAULT_SETTINGS.language,
            uiLanguage: typeof saved.uiLanguage === 'string' ? saved.uiLanguage : '',
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

    // Arayüz için: PROVIDERS üzerinde marka görünümü. Anahtarsız motorlar
    // (llm7 + pollinations) tek "NesilAI YZ" girişi olarak birleştirilir;
    // öbür sağlayıcılar olduğu gibi yansıtılır.
    function getUiProviders() {
        const list = [];
        Object.keys(PROVIDERS).forEach(id => {
            if (isNesilAiBrand(id)) return;
            list.push(PROVIDERS[id]);
        });
        const engines = FREE_PROVIDER_IDS.map(pid => PROVIDERS[pid]);
        const active = engines.find(p => p.id === getSettings().provider) || engines[0];
        list.unshift({
            id: 'nesilai-yz',
            label: 'NesilAI YZ (ücretsiz — anahtar yok)',
            short: BRAND_NAME,
            brand: true,
            engines: engines,
            activeEngine: active,
            defaultModel: active.defaultModel,
            suggestedModels: active.suggestedModels,
            modelHints: active.modelHints || {},
            needsKey: false,
            vision: false,
            note: 'Anahtarsız, ücretsiz NesilAI motoru. Gerçek modeli aşağıdan seç.'
        });
        return list;
    }

    function getProviderByUiId(uiId) {
        if (uiId === 'nesilai-yz') {
            // UI markasından gerçek motora çöz: kullanıcının seçtiği motor
            const settings = getSettings();
            return isNesilAiBrand(settings.provider) ? PROVIDERS[settings.provider] : PROVIDERS.llm7;
        }
        return PROVIDERS[uiId] || null;
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
        } else        if (status === 429) {
            kind = 'quota';
            if (provider.id === 'llm7' && !getApiKey(provider.id)) {
                message = `${provider.short} şu anahtarsız katman yoğunluğu nedeniyle limiti aştı (429). ` +
                    'Ayarlar → Yapay Zeka → "Ücretsiz hız anahtarı" ile bedava token alırsan limitin kişiselleşir ve bu hata biter. ' +
                    'Ya da biraz bekleyip tekrar dene.';
            } else {
                message = `${provider.short} şu an istek limitini aştı (429). Biraz bekleyip tekrar dene ya da Ayarlar'dan başka bir sağlayıcıya geç.`;
            }
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

    // 429 gövdesinden bekleme süresini çıkar: { retry_after: 10 } ya da
    // "Retry after 10 seconds" biçimleri (llm7 anonim katman bunları üretir).
    function parseRetryAfterMs(status, bodyText) {
        if (status !== 429) return 0;
        let seconds = 0;
        try {
            const j = JSON.parse(bodyText);
            if (j && typeof j.retry_after === 'number') seconds = j.retry_after;
            else if (j && j.error && typeof j.error.retry_after === 'number') seconds = j.error.retry_after;
        } catch (e) { /* metinden ayrıştırılır */ }
        if (!seconds) {
            const m = /retry\s*after\s*(\d+(?:\.\d+)?)/i.exec(bodyText || '');
            if (m) seconds = Number(m[1]);
        }
        seconds = Math.min(Math.max(seconds || 3, 1), 10); // 1–10 sn ile sınırla
        return Math.round(seconds * 1000) + 250; // küçük tampon
    }

    // 429 → sunucunun söylediği süre kadar bekleyip yeniden dene.
    // Anonim llm7 katmanında retry_after genellikle 10 sn'dir: 2 deneme
    // (~21 sn) sonra yedeğe geçmek, uzun donma hissi vermeden sohbeti
    // sürdürür. Yedek motorun da kendi yeniden denemeleri vardır.
    const RETRY_429_MAX = 2;
    async function fetchWith429Retry(url, init, provider, guard) {
        let attempt = 0;
        while (true) {
            let response;
            try {
                response = await fetch(url, init);
            } catch (error) {
                throw normalizeFetchError(error, provider);
            }
            if (response.status === 429 && attempt < RETRY_429_MAX && !guard.signal.aborted) {
                const bodyText = await readErrorBody(response);
                const waitMs = parseRetryAfterMs(429, bodyText);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                if (guard.signal.aborted) throw new DOMException('İşlem iptal edildi', 'AbortError');
                attempt++;
                continue;
            }
            return response;
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
            `${provider.short} şu an bu isteği karşılayamıyor. ` +
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
            // minimax modelleri (llm7) bazen yanıtın sonuna araç çağrısı
            // kalıntısı ekler: <minimax:tool_call>…<invoke>… — bunu temizle
            .replace(/\n*<minimax:tool_call>[\s\S]*$/i, '')
            .replace(/\n*<function_calls>\s*<invoke[\s\S]*$/i, '')
            // reasoning modelleri (GLM, minimax) <think>…</think> bloğu basar;
            // yanıtı bozmamak için yalnızca DENGELİ çiftler kaldırılır
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .trim();
    }

    // Sağlayıcıya özel metin temizliği + gömülü hata kontrolü
    function finalizeText(text, provider) {
        let trimmed = text.trim();

        if (provider.id === 'pollinations') {
            const embedded = checkEmbeddedError(trimmed, provider);
            if (embedded) throw embedded;
        }

        // Araç çağrısı / altbilgi kalıntılarını tüm açıkai uyumlu motorlarda temizle
        trimmed = stripProviderFooter(trimmed);
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
        let system = opts.system !== undefined
            ? opts.system
            : (settings.systemPrompt || DEFAULT_SYSTEM_PROMPT);
        const temperature = typeof opts.temperature === 'number' ? opts.temperature : settings.temperature;

        // Dil seçimi: ayarlardan sabitlenmişse sistem istemine direktif ekle.
        // İç yardımcı çağrılar (bellek sınıflandırma, OCR, hedef tespiti…)
        // muaf: çıktıları kullanıcıya gösterilmez, sabit dil görevi bozar
        // (örn. "classify in English" istemi Türkçe olursa doğru çalışmaz).
        const internalCaller = opts.__internal === true ||
            (typeof opts.__internal === 'string' && INTERNAL_CALLER_IDS.indexOf(opts.__internal) !== -1);
        if (!internalCaller) {
            const langDirective = buildLanguageDirective();
            if (langDirective) system = system + '\n\n' + langDirective;
        }

        // TON MODLARI: /trustme ve /acsmod açıkken sistem istemine direktif eklenir
        try {
            if (localStorage.getItem('nesilai_trustme') === 'true') system = system + '\n\n' + TRUSTME_SYSTEM;
            if (localStorage.getItem('nesilai_acsmod') === 'true') system = system + '\n\n' + ACSMOD_SYSTEM;
        } catch (e) { /* localStorage erişilemiyorsa modlar devre dışı */ }

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
        try {
            return await chatOpenAiCompatible(provider, messages, system, temperature, opts);
        } catch (err) {
            // Anahtarsız NesilAI YZ tıkandıysa (429/quota/network) ve kullanıcı
            // anahtarlı bir sağlayıcıya geçmemişse → bağımsız anahtarsız yedek:
            // Pollinations metin. Böylece tek ücretsiz motorun geçici kilidi
            // tüm sohbeti durdurmaz.
            const canFallback = opts.fallback !== false &&
                provider.id === 'llm7' &&
                !getApiKey('llm7') &&
                (opts.providerId || settings.provider) === 'llm7' &&
                err && (err.status === 429 || err.kind === 'quota' || err.kind === 'network');
            if (!canFallback) throw err;
            try {
                const result = await chatOpenAiCompatible(PROVIDERS.pollinations, messages, system, temperature, opts);
                result.fallbackFrom = provider.id;
                return result;
            } catch (e2) {
                throw err; // asıl (daha bilgilendirici) hatayı göster
            }
        }
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
            response = await fetchWith429Retry(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: guard.signal
            }, provider, guard);
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
            response = await fetchWith429Retry(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: guard.signal
            }, provider, guard);
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
        BRAND_NAME: BRAND_NAME,
        isNesilAiBrand: isNesilAiBrand,
        getUiProviders: getUiProviders,
        getProviderByUiId: getProviderByUiId,
        getUiProvider: getProviderByUiId,
        AI_LANGUAGES: AI_LANGUAGES,
        UI_LANGUAGES: UI_LANGUAGES,
        getLanguage: getLanguage,
        getUiLanguage: getUiLanguage,
        translateUi: translateUi,
        buildLanguageDirective: buildLanguageDirective,
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
