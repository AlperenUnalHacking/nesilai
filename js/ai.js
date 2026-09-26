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
        { code: 'de', name: 'Almanca', flag: '🇩🇪' }
    ];
    const LANGUAGE_INSTRUCTIONS = {
        ru: 'her zaman Rusça yanıt ver (kullanıcı başka dilde yazsa bile)',
        tr: 'her zaman Türkçe yanıt ver (kullanıcı başka dilde yazsa bile)',
        es: 'her zaman İspanyolca yanıt ver (kullanıcı başka dilde yazsa bile)',
        hi: 'her zaman Hintçe yanıt ver (kullanıcı başka dilde yazsa bile)',
        de: 'her zaman Almanca yanıt ver (kullanıcı başka dilde yazsa bile)'
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
        { code: 'de', name: 'Almanca', flag: '🇩🇪' }
    ];

    const UI_TRANSLATIONS = {
        ru: {
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
            'NesilAI YZ modelini değiştir': 'Сменить модель NesilAI YZ', 'Üretim modu seç': 'Выбрать режим создания'
        },
        es: {
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
            'NesilAI YZ modelini değiştir': 'Cambiar el modelo de NesilAI YZ', 'Üretim modu seç': 'Elegir modo de creación'
        },
        hi: {
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
            'NesilAI YZ modelini değiştir': 'NesilAI YZ मॉडल बदलें', 'Üretim modu seç': 'निर्माण मोड चुनें'
        },
        de: {
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
            'NesilAI YZ modelini değiştir': 'NesilAI YZ-Modell wechseln', 'Üretim modu seç': 'Erstellungsmodus wählen'
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
    // Anonim ücretsiz katmanlarda (llm7) "Too many concurrent requests"
    // saniyeler içinde kendini düzeltir; kullanıcıya hata göstermeden önce
    // 2 kez sabırla davranmak çoğu hatayı tamamen ortadan kaldırır.
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
