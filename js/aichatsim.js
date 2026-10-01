/* ========================================================
   AI Chat Simulator (/aichatsim)
   --------------------------------------------------------
   Yapay zekalar kendi aralarında sohbet eder; kullanıcı da
   yazabilir. Solda aktif AI'lar listelenir: sağlayıcı +
   model + karakter modu (Zorba, Dost Canlısı, Akıllı,
   Hayalperest, Dahi, Aptal). Bir AI'a tıklayınca DM açılır;
   diğer AI'lar hakkında bilgisi olur (dedikodu kanalı).
   Ayarlardan konu verilir; AI'lar o konuda tartışır.
   Arayüz NesilAI estetiğini taşır.
   ======================================================== */
(function () {
    'use strict';

    var AI = window.NesilAI;
    if (!AI) return;

    // ========================================================
    // Karakter Modları
    // ========================================================
    var MODES = {
        zorba: {
            label: 'Zorba', emoji: '😤',
            prompt: 'Karakterin: ZORBA. Agresif, küçümseyici ve keskin konuşursun; kimseye taviz vermezsin, haklıysan üstüne basarak söylersin. Yine de saygısız hakaret yok — keskin mizahtır.'
        },
        friendly: {
            label: 'Dost Canlısı', emoji: '😄',
            prompt: 'Karakterin: DOST CANLISI. Sıcak, destekleyici ve neşelisin; herkesi yüreklendirir, ortamı yumuşatırsın.'
        },
        smart: {
            label: 'Akıllı', emoji: '🧠',
            prompt: 'Karakterin: AKILLI. Analitik, öz ve mantıksın; her mesajda somut gerekçe veya veri verirsin.'
        },
        dreamer: {
            label: 'Hayalperest', emoji: '🌈',
            prompt: 'Karakterin: HAYALPEREST. Yaratıcı ve fantezist konuşursun; büyük fikirler, metaforlar ve imkânsızı denemeyi seversin.'
        },
        genius: {
            label: 'Dahi', emoji: '💡',
            prompt: 'Karakterin: DAHİ. İnce detaylar görür, herkesin kaçırdığı derin bağlantıları kurarsın; biraz da gizemli konuşursun.'
        },
        silly: {
            label: 'Aptal', emoji: '🤪',
            prompt: 'Karakterin: APTAL. Komik ve dağınık düşünürsün; konuyu savurur, saçma ama sevimli çıkarımlar yaparsın. Amaç mizah — kimseyi rencide etme.'
        }
    };
    var MODE_KEYS = Object.keys(MODES);

    var BOTS_KEY = 'aichatsim_bots_v1';
    var TOPIC_KEY = 'aichatsim_topic_v1';
    var LOG_KEY = 'aichatsim_log_v1';

    var S = {
        open: false,
        busy: false,
        auto: false,
        bots: [],
        topic: '',
        log: [],
        dmWith: null   // dm açıkken hedef bot adı
    };

    function $(sel, root) { return (root || document).querySelector(sel); }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ========================================================
    // Kalıcılık
    // ========================================================
    function loadBots() {
        try {
            var raw = localStorage.getItem(BOTS_KEY);
            if (raw) {
                var arr = JSON.parse(raw);
                if (Array.isArray(arr)) S.bots = arr.filter(function (b) { return b && b.name; });
            }
        } catch (e) {}
        if (!S.bots.length) {
            S.bots = [
                { id: 'bot_' + Date.now() + 'a', name: 'Codestral', providerId: 'llm7', model: 'codestral-latest', mode: 'smart' },
                { id: 'bot_' + Date.now() + 'b', name: 'MiniMax', providerId: 'llm7', model: 'GLM-5.3-Flash', mode: 'friendly' }
            ];
            saveBots();
        }
    }
    function saveBots() {
        try { localStorage.setItem(BOTS_KEY, JSON.stringify(S.bots)); } catch (e) {}
    }
    function loadTopic() {
        try { S.topic = localStorage.getItem(TOPIC_KEY) || ''; } catch (e) { S.topic = ''; }
    }
    function saveTopic() {
        try { localStorage.setItem(TOPIC_KEY, S.topic); } catch (e) {}
    }
    function loadLog() {
        try {
            var raw = localStorage.getItem(LOG_KEY);
            if (raw) {
                var arr = JSON.parse(raw);
                if (Array.isArray(arr)) S.log = arr.slice(-120);
            }
        } catch (e) {}
    }
    function saveLog() {
        try { localStorage.setItem(LOG_KEY, JSON.stringify(S.log.slice(-120))); } catch (e) {}
    }

    // ========================================================
    // Sağlayıcı yardımcıları
    // ========================================================
    function listReadyProviders() {
        var list = AI.getUiProviders ? AI.getUiProviders() : [];
        return list.filter(function (p) {
            var r = AI.isReady(p.id);
            return r && r.ok && p.id !== 'pollinations';
        });
    }
    function providerShort(id) {
        var list = AI.getUiProviders ? AI.getUiProviders() : [];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].short;
        return id;
    }
    function botReady(b) {
        var r = AI.isReady(b.providerId);
        return !!(r && r.ok);
    }
    function modeOf(b) { return MODES[b.mode] || MODES.smart; }

    // ========================================================
    // Sohbet mantığı
    // ========================================================
    function groupMessages(limit) {
        // Grup sohbeti bağlamı: son N mesaj + kim kimdir özeti
        var lines = [];
        S.bots.forEach(function (b) {
            lines.push('- ' + b.name + ' (' + providerShort(b.providerId) + ', ' + modeOf(b).label + ' modunda)');
        });
        var recent = S.log.slice(-(limit || 14));
        var chat = recent.map(function (m) {
            return m.who + ': ' + m.text;
        }).join('\n');
        return {
            roster: lines.join('\n'),
            recent: chat || '(henüz mesaj yok)'
        };
    }

    function buildBotSystem(b) {
        var parts = [
            'Sen "' + b.name + '" adında bir yapay zekâsın ve AI Chat Simulator adlı sohbet odasındasın.',
            'Odadaki diğer katılımcılar:',
            groupMessages().roster,
            'Karakter modun: ' + modeOf(b).prompt,
            'Kurallar: 1-3 cümle yaz, Türkçe konuş. Mesajının başına adını yazma; kim olduğunu biliyoruz.',
            'Diğer yapay zekâları tanıyorsun; hakkınızda serbestçe konuşabilir, espri yapabilir, tartışabilirsin.'
        ];
        if (S.topic) parts.push('Grubun güncel tartışma konusu: "' + S.topic + '". Bu konuya değin.');
        if (S.dmWith && S.dmWith !== b.name) {
            parts.push('ÖNEMLİ: Şu an "' + S.dmWith + '" ile BİREBİR (DM) konuşuyorsun; mesajın yalnızca ona görünecek.');
        }
        return parts.join('\n');
    }

    function buildBotMessages(b, extra) {
        var msgs = [];
        S.log.slice(-12).forEach(function (m) {
            if (m.dm && m.dm !== b.name && m.who !== b.name) return; // başkasının DM'i bağlama girmez
            if (m.who === b.name) {
                msgs.push({ role: 'assistant', content: m.text });
            } else {
                var prefix = m.who === 'Sen' ? '' : m.who + ' şöyle dedi: ';
                var content = prefix + m.text;
                var prev = msgs[msgs.length - 1];
                // llm7 gibi sağlayıcılar ardışık user mesajını reddediyor → birleştir
                if (prev && prev.role === 'user') {
                    prev.content = prev.content + '\n' + content;
                } else {
                    msgs.push({ role: 'user', content: content });
                }
            }
        });
        if (extra) {
            var lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.role === 'user') lastMsg.content = lastMsg.content + '\n' + extra;
            else msgs.push({ role: 'user', content: extra });
        }
        if (!msgs.length) msgs.push({ role: 'user', content: 'Sohbeti sen başlat.' });
        return msgs;
    }

    async function callBot(b, extra) {
        var res = await AI.chat({
            messages: buildBotMessages(b, extra),
            providerId: b.providerId,
            model: b.model || undefined,
            system: buildBotSystem(b),
            temperature: 0.9,
            fallback: false,
            __internal: true
        });
        var text = typeof res === 'string' ? res : res.text;
        return String(text || '').replace(/^\s*(?:'+ b.name + '|Ben)\s*:\s*/i, '').trim();
    }

    async function nextTurn(speakerName) {
        var candidates = S.bots.filter(botReady);
        if (!candidates.length) throw new Error('Hazır yapay zekâ yok. Bir bot ekle ve sağlayıcı anahtarını gir.');
        // Konuşmacı seçimi: zorunlu isim > DM hedefi > rastgele
        var b = null;
        if (speakerName) {
            b = candidates.find(function (x) { return x.name === speakerName; }) || candidates[0];
        } else if (S.dmWith) {
            b = candidates.find(function (x) { return x.name === S.dmWith; });
            if (!b) throw new Error('DM hedefi "' + S.dmWith + '" hazır değil.');
        } else {
            b = candidates[Math.floor(Math.random() * candidates.length)];
        }
        var extra = null;
        if (S.topic && !S.dmWith) extra = 'Konuyla ilgili bir mesaj yaz.';
        var text = await callBot(b, extra);
        return { bot: b, text: text };
    }

    // ========================================================
    // Arayüz
    // ========================================================
    var el = null;

    function ensureDom() {
        if (el && el.root && document.body.contains(el.root)) return;
        var root = document.createElement('div');
        root.id = 'aichatsim-root';
        root.className = 'acsim hidden';
        root.innerHTML =
            '<div class="acsim-shell">' +
                '<header class="acsim-header">' +
                    '<div class="acsim-brand">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-chat"/></svg>' +
                        '<strong>AI Chat Simulator</strong>' +
                        '<span class="acsim-sub">Yapay zekâlar birbirine dedikodu yapar, sen de yazarsın</span>' +
                    '</div>' +
                    '<div class="acsim-header-actions">' +
                        '<button type="button" id="acsim-topic-btn" class="acsim-btn acsim-btn-ghost">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-edit"/></svg><span>Konu</span></button>' +
                        '<button type="button" id="acsim-auto-btn" class="acsim-btn acsim-btn-ghost">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-zap"/></svg><span>Otomatik</span></button>' +
                        '<button type="button" id="acsim-clear" class="acsim-btn acsim-btn-ghost" title="Sohbeti temizle">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg></button>' +
                        '<button type="button" id="acsim-close" class="acsim-btn acsim-btn-ghost" title="Kapat (Esc)">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button>' +
                    '</div>' +
                '</header>' +
                '<div class="acsim-body">' +
                    '<aside class="acsim-side">' +
                        '<div class="acsim-side-head">Aktif yapay zekâlar</div>' +
                        '<div id="acsim-bot-list" class="acsim-bot-list"></div>' +
                        '<button type="button" id="acsim-add-bot" class="acsim-btn acsim-btn-ghost acsim-add-btn">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg><span>Yapay zekâ ekle</span></button>' +
                        '<div id="acsim-topic-box" class="acsim-topic hidden">' +
                            '<label>Konuşma konusu</label>' +
                            '<input id="acsim-topic-input" type="text" class="acsim-input" placeholder="örn. İnsanlar robotlardan mı korkmalı?" spellcheck="false">' +
                            '<div class="acsim-topic-actions">' +
                                '<button type="button" id="acsim-topic-save" class="acsim-btn acsim-btn-accent">Kaydet</button>' +
                                '<button type="button" id="acsim-topic-clear" class="acsim-btn acsim-btn-ghost">Temizle</button>' +
                            '</div>' +
                        '</div>' +
                        '<div id="acsim-add-form" class="acsim-topic hidden">' +
                            '<label>Yeni yapay zekâ</label>' +
                            '<input id="acsim-new-name" type="text" class="acsim-input" placeholder="Ad" spellcheck="false">' +
                            '<select id="acsim-new-provider" class="acsim-input"></select>' +
                            '<input id="acsim-new-model" type="text" class="acsim-input" placeholder="Model (boşsa varsayılan)" spellcheck="false">' +
                            '<select id="acsim-new-mode" class="acsim-input">' +
                                MODE_KEYS.map(function (k) {
                                    return '<option value="' + k + '">' + MODES[k].emoji + ' ' + MODES[k].label + '</option>';
                                }).join('') +
                            '</select>' +
                            '<button type="button" id="acsim-new-save" class="acsim-btn acsim-btn-accent acsim-block">Ekle</button>' +
                        '</div>' +
                    '</aside>' +
                    '<main class="acsim-main">' +
                        '<div id="acsim-dm-banner" class="acsim-dm-banner hidden"></div>' +
                        '<div id="acsim-messages" class="acsim-messages"></div>' +
                        '<div class="acsim-composer">' +
                            '<input id="acsim-input" type="text" class="acsim-input" placeholder="Sohbete katıl…" spellcheck="false">' +
                            '<button type="button" id="acsim-send" class="acsim-btn acsim-btn-accent" title="Gönder">' +
                                '<svg class="icon" aria-hidden="true"><use href="#i-send"/></svg></button>' +
                        '</div>' +
                    '</main>' +
                '</div>' +
            '</div>';
        document.body.appendChild(root);
        el = {
            root: root,
            botList: $('#acsim-bot-list', root),
            messages: $('#acsim-messages', root),
            input: $('#acsim-input', root),
            send: $('#acsim-send', root),
            close: $('#acsim-close', root),
            clear: $('#acsim-clear', root),
            autoBtn: $('#acsim-auto-btn', root),
            topicBtn: $('#acsim-topic-btn', root),
            topicBox: $('#acsim-topic-box', root),
            topicInput: $('#acsim-topic-input', root),
            topicSave: $('#acsim-topic-save', root),
            topicClear: $('#acsim-topic-clear', root),
            addBotBtn: $('#acsim-add-bot', root),
            addForm: $('#acsim-add-form', root),
            newName: $('#acsim-new-name', root),
            newProvider: $('#acsim-new-provider', root),
            newModel: $('#acsim-new-model', root),
            newMode: $('#acsim-new-mode', root),
            newSave: $('#acsim-new-save', root),
            dmBanner: $('#acsim-dm-banner', root)
        };

        el.send.addEventListener('click', function () { sendUser(); });
        el.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); sendUser(); }
        });
        el.close.addEventListener('click', closeView);
        el.clear.addEventListener('click', function () {
            S.log = []; saveLog(); renderMessages();
        });
        el.autoBtn.addEventListener('click', toggleAuto);
        el.topicBtn.addEventListener('click', function () {
            el.topicBox.classList.toggle('hidden');
            el.addForm.classList.add('hidden');
            el.topicInput.value = S.topic;
        });
        el.topicSave.addEventListener('click', function () {
            S.topic = el.topicInput.value.trim(); saveTopic();
            el.topicBox.classList.add('hidden');
            pushSys('Konu belirlendi: ' + (S.topic || 'serbest sohbet'));
        });
        el.topicClear.addEventListener('click', function () {
            S.topic = ''; saveTopic(); el.topicInput.value = '';
        });
        el.addBotBtn.addEventListener('click', function () {
            el.addForm.classList.toggle('hidden');
            el.topicBox.classList.add('hidden');
            fillProviderSelect();
        });
        el.newSave.addEventListener('click', addBot);
    }

    function fillProviderSelect() {
        el.newProvider.innerHTML = '';
        listReadyProviders().forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.short || p.id;
            el.newProvider.appendChild(opt);
        });
    }

    function renderBotList() {
        if (!el) return;
        el.botList.innerHTML = '';
        S.bots.forEach(function (b) {
            var ready = botReady(b);
            var row = document.createElement('div');
            row.className = 'acsim-bot' + (ready ? '' : ' acsim-bot-off') + (S.dmWith === b.name ? ' acsim-bot-active' : '');
            row.innerHTML =
                '<div class="acsim-bot-top">' +
                    '<span class="acsim-bot-name">' + esc(b.name) + '</span>' +
                    '<select class="acsim-mode-select" title="Karakter modu">' +
                        MODE_KEYS.map(function (k) {
                            return '<option value="' + k + '"' + (b.mode === k ? ' selected' : '') + '>' + MODES[k].emoji + ' ' + MODES[k].label + '</option>';
                        }).join('') +
                    '</select>' +
                '</div>' +
                '<div class="acsim-bot-meta">' + esc(providerShort(b.providerId)) + ' · ' + esc(b.model || 'varsayılan') + '</div>' +
                '<div class="acsim-bot-actions">' +
                    '<button type="button" class="acsim-bot-dm" title="DM aç">DM</button>' +
                    '<button type="button" class="acsim-bot-say" title="Konuşsun">Konuş</button>' +
                    '<button type="button" class="acsim-bot-del" title="Kaldır">✕</button>' +
                '</div>';
            row.querySelector('.acsim-mode-select').addEventListener('change', function (e) {
                b.mode = e.target.value; saveBots();
            });
            row.querySelector('.acsim-bot-dm').addEventListener('click', function () {
                S.dmWith = (S.dmWith === b.name) ? null : b.name;
                renderBotList();
                renderDmBanner();
            });
            row.querySelector('.acsim-bot-say').addEventListener('click', function () {
                autoTurn(b.name);
            });
            row.querySelector('.acsim-bot-del').addEventListener('click', function () {
                S.bots = S.bots.filter(function (x) { return x !== b; });
                if (S.dmWith === b.name) S.dmWith = null;
                saveBots(); renderBotList(); renderDmBanner();
            });
            el.botList.appendChild(row);
        });
    }

    function renderDmBanner() {
        if (S.dmWith) {
            el.dmBanner.textContent = '✉️ DM: ' + S.dmWith + ' ile birebir konuşuyorsun — diğerleri görmüyor. (Kapatmak için soldaki DM düğmesine tekrar bas)';
            el.dmBanner.classList.remove('hidden');
        } else {
            el.dmBanner.classList.add('hidden');
        }
    }

    function pushSys(text) {
        S.log.push({ who: 'sistem', text: text, t: Date.now(), sys: true });
        saveLog();
        renderMessages();
    }

    function renderMessages() {
        if (!el) return;
        el.messages.innerHTML = '';
        S.log.forEach(function (m) { appendMsgDom(m); });
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function appendMsgDom(m) {
        var d = document.createElement('div');
        if (m.sys) {
            d.className = 'acsim-msg acsim-sys';
            d.textContent = m.text;
        } else {
            var isUser = m.who === 'Sen';
            d.className = 'acsim-msg' + (isUser ? ' acsim-user' : '');
            var b = S.bots.find(function (x) { return x.name === m.who; });
            var mode = b ? modeOf(b) : null;
            d.innerHTML =
                '<div class="acsim-msg-head">' +
                    '<span class="acsim-msg-name">' + esc(m.who) + '</span>' +
                    (mode ? '<span class="acsim-msg-mode">' + esc(mode.emoji + ' ' + mode.label) + '</span>' : '') +
                    (m.dm ? '<span class="acsim-msg-dm">DM</span>' : '') +
                '</div>' +
                '<div class="acsim-msg-text"></div>';
            d.querySelector('.acsim-msg-text').textContent = m.text;
        }
        el.messages.appendChild(d);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function addMsg(who, text, dm) {
        var m = { who: who, text: text, t: Date.now() };
        if (dm) m.dm = dm;
        S.log.push(m);
        saveLog();
        appendMsgDom(m);
    }

    async function sendUser() {
        var v = (el.input.value || '').trim();
        if (!v || S.busy) return;
        el.input.value = '';
        addMsg('Sen', v, S.dmWith);
        // Kullanıcı yazınca bir bot cevap versin (grupta rastgele, DM'de hedef)
        await autoTurn();
    }

    async function autoTurn(forcedName) {
        if (S.busy) return;
        S.busy = true;
        setBusyUi(true);
        try {
            var out = await nextTurn(forcedName);
            if (out && out.text) addMsg(out.bot.name, out.text, S.dmWith);
        } catch (err) {
            pushSys('Hata: ' + (err && err.message ? err.message : 'bilinmeyen'));
        } finally {
            S.busy = false;
            setBusyUi(false);
        }
    }

    function setBusyUi(on) {
        if (el) el.send.disabled = on;
        if (el) el.autoBtn.classList.toggle('acsim-auto-on', S.auto && on);
    }

    function toggleAuto() {
        S.auto = !S.auto;
        el.autoBtn.classList.toggle('acsim-auto-on', S.auto);
        pushSys(S.auto ? 'Otomatik tartışma başladı — yapay zekâlar sırayla konuşacak.' : 'Otomatik tartışma durdu.');
        if (S.auto) autoLoop();
    }

    async function autoLoop() {
        while (S.auto && S.open) {
            await autoTurn();
            await new Promise(function (r) { setTimeout(r, 2500); });
        }
    }

    function addBot() {
        var name = (el.newName.value || '').trim();
        if (!name) return;
        if (S.bots.some(function (b) { return b.name === name; })) { pushSys('Bu isim zaten kullanılıyor.'); return; }
        S.bots.push({
            id: 'bot_' + Date.now(),
            name: name,
            providerId: el.newProvider.value || 'llm7',
            model: (el.newModel.value || '').trim(),
            mode: el.newMode.value || 'smart'
        });
        saveBots();
        el.newName.value = ''; el.newModel.value = '';
        el.addForm.classList.add('hidden');
        renderBotList();
        pushSys(name + ' odaya katıldı.');
    }

    function openView() {
        ensureDom();
        loadBots();
        loadTopic();
        loadLog();
        el.root.classList.remove('hidden');
        S.open = true;
        renderBotList();
        renderDmBanner();
        renderMessages();
        if (!S.log.length) {
            pushSys('Sohbet odası açıldı. Soldaki yapay zekâları yönet, konu ver ya da sen yaz — onlar da cevap verir.');
        }
    }
    function closeView() {
        if (!el) return;
        S.auto = false; // kapanınca döngü dursun
        el.root.classList.add('hidden');
        S.open = false;
    }
    function toggleView() {
        if (S.open) closeView(); else openView();
    }

    // /aichatsim komut yönlendirmesi
    function handleCommand(body) {
        var b = String(body || '').trim().toLowerCase();
        if (b === 'on') { openView(); return 'AI Chat Simulator açıldı — yapay zekâlar sohbet etmeye hazır.'; }
        if (b === 'off') { closeView(); return 'AI Chat Simulator kapatıldı.'; }
        toggleView();
        return S.open
            ? 'AI Chat Simulator açıldı. Soldan yapay zekâ ekleyip karakter modunu seç; Konu düğmesinden tartışma başlığı verebilirsin.'
            : 'AI Chat Simulator kapatıldı.';
    }

    (function bindSidebarButton() {
        var btn = document.getElementById('open-aichatsim-btn');
        if (btn) btn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleView();
        });
    })();

    window.NesilAiChatSim = {
        open: openView,
        close: closeView,
        toggle: toggleView,
        handleCommand: handleCommand,
        isOpen: function () { return !!S.open; },
        getBots: function () { return JSON.parse(JSON.stringify(S.bots)); },
        getTopic: function () { return S.topic; },
        _test: { state: S, MODES: MODES, nextTurn: nextTurn }
    };
})();
