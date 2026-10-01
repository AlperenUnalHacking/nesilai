/* ========================================================
   NesilLLM — Klasik LLM Uygulaması
   --------------------------------------------------------
   /llm komutuyla açılır (kenar çubuğu düğmesi de var).
   Tam bir LLM sohbeti: sor, yanıtı akış halinde al,
   çok turlu geçmişle devam et. Yarış/jüri yok — düz, sade.
   Sağlayıcı ve model seçimi kullanıcıda:
   llm7 (minimax, codestral) + Ayarlar'dan eklenen kendi
   API sağlayıcıları (Gemini, Groq, OpenRouter, OpenAI, Özel).
   ======================================================== */
(function () {
    'use strict';

    var AI = window.NesilAI;
    if (!AI) return; // ai.js yüklenmemişse modül sessizce çıkar

    // ========================================================
    // Durum + Kalıcılık
    // ========================================================
    var S = {
        open: false,
        busy: false,
        providerId: 'llm7',
        model: '',            // boş = sağlayıcının varsayılanı
        history: []           // { role: 'user'|'assistant', text }
    };
    var SETTINGS_KEY = 'nesilllm_settings_v2';
    var HISTORY_KEY = 'nesilllm_history_v1';
    var abortController = null;

    function $(sel, root) { return (root || document).querySelector(sel); }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function loadSettings() {
        try {
            var raw = localStorage.getItem(SETTINGS_KEY);
            if (raw) {
                var o = JSON.parse(raw);
                if (o && o.providerId) S.providerId = o.providerId;
                if (o && typeof o.model === 'string') S.model = o.model;
            }
        } catch (e) { /* varsayılan kalır */ }
    }
    function saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify({ providerId: S.providerId, model: S.model }));
        } catch (e) {}
    }
    function loadHistory() {
        try {
            var raw = localStorage.getItem(HISTORY_KEY);
            if (raw) {
                var arr = JSON.parse(raw);
                if (Array.isArray(arr)) S.history = arr.filter(function (m) {
                    return m && (m.role === 'user' || m.role === 'assistant') && m.text;
                }).slice(-40);
            }
        } catch (e) { /* sıfır */ }
    }
    function saveHistory() {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(S.history.slice(-40))); } catch (e) {}
    }

    // ========================================================
    // Sağlayıcı / Model yardımcıları
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
    function providerSuggestions(pid) {
        var p = AI.PROVIDERS[pid] || {};
        var out = (p.suggestedModels || []).slice();
        if (p.defaultModel && out.indexOf(p.defaultModel) === -1) out.unshift(p.defaultModel);
        var stored = (AI.getSettings().models || {})[pid];
        if (stored && out.indexOf(stored) === -1) out.push(stored);
        return out;
    }
    function currentLabel() {
        return providerShort(S.providerId) + ' · ' + (S.model || 'varsayılan');
    }

    // ========================================================
    // Çekirdek: klasik sohbet
    // ========================================================
    function buildMessages(question) {
        var msgs = [];
        S.history.slice(-40).forEach(function (m) {
            msgs.push({ role: m.role, content: m.text });
        });
        msgs.push({ role: 'user', content: question });
        return msgs;
    }
    function buildSystem() {
        return 'NesilLLM: klasik bir yapay zekâ asistanısın. Net, doğru ve eksiksiz yanıt ver; gereksiz uzatma, özü koru.';
    }

    async function askLLM(question, onDelta) {
        abortController = new AbortController();
        var res = await AI.chat({
            messages: buildMessages(question),
            providerId: S.providerId,
            model: S.model || undefined,
            system: buildSystem(),
            onDelta: onDelta || null,
            signal: abortController.signal,
            fallback: false
        });
        var text = typeof res === 'string' ? res : res.text;
        S.history.push({ role: 'user', text: String(question) });
        S.history.push({ role: 'assistant', text: String(text || '') });
        S.history = S.history.slice(-40);
        saveHistory();
        return { text: text, label: currentLabel() };
    }

    function stopAsk() {
        if (abortController) { try { abortController.abort(); } catch (e) {} }
    }

    // ========================================================
    // Arayüz — NesilAI estetiğiyle tam ekran uygulama
    // ========================================================
    var el = null;

    function ensureDom() {
        if (el && el.root && document.body.contains(el.root)) return;
        var root = document.createElement('div');
        root.id = 'nesilllm-root';
        root.className = 'nllm hidden';
        root.innerHTML =
            '<div class="nllm-shell">' +
                '<header class="nllm-header">' +
                    '<div class="nllm-brand">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-cpu"/></svg>' +
                        '<strong>NesilLLM</strong>' +
                        '<span class="nllm-sub">Klasik yapay zekâ sohbeti</span>' +
                    '</div>' +
                    '<div class="nllm-header-actions">' +
                        '<button type="button" id="nllm-model-btn" class="nllm-btn nllm-btn-ghost" title="Sağlayıcı ve model seç">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-cpu"/></svg><span id="nllm-model-label">—</span></button>' +
                        '<button type="button" id="nllm-clear" class="nllm-btn nllm-btn-ghost" title="Sohbeti temizle">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg><span>Temizle</span></button>' +
                        '<button type="button" id="nllm-close" class="nllm-btn nllm-btn-ghost" title="Kapat (Esc)">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button>' +
                    '</div>' +
                '</header>' +
                '<div id="nllm-model-panel" class="nllm-settings hidden">' +
                    '<h3>Model</h3>' +
                    '<p class="nllm-set-note">Sağlayıcıyı seç; model adını yaz ya da listeden seç. Kendi API sağlayıcın Ayarlar → Yapay Zeka bölümünden anahtarını ekledikten sonra burada listelenir.</p>' +
                    '<div class="nllm-add-row">' +
                        '<select id="nllm-provider" class="nllm-select"></select>' +
                        '<input id="nllm-model" type="text" class="nllm-input" list="nllm-model-list" placeholder="model adı" spellcheck="false">' +
                        '<datalist id="nllm-model-list"></datalist>' +
                        '<button type="button" id="nllm-model-save" class="nllm-btn nllm-btn-accent">Kaydet</button>' +
                    '</div>' +
                '</div>' +
                '<div id="nllm-messages" class="nllm-messages"></div>' +
                '<div class="nllm-composer">' +
                    '<textarea id="nllm-input" rows="1" placeholder="Sorunu yaz…" spellcheck="false"></textarea>' +
                    '<button type="button" id="nllm-stop" class="nllm-btn nllm-btn-ghost hidden" title="Durdur">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-stop"/></svg></button>' +
                    '<button type="button" id="nllm-send" class="nllm-btn nllm-btn-accent" title="Gönder">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-send"/></svg></button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(root);
        el = {
            root: root,
            messages: $('#nllm-messages', root),
            input: $('#nllm-input', root),
            send: $('#nllm-send', root),
            stop: $('#nllm-stop', root),
            close: $('#nllm-close', root),
            clear: $('#nllm-clear', root),
            modelBtn: $('#nllm-model-btn', root),
            modelLabel: $('#nllm-model-label', root),
            modelPanel: $('#nllm-model-panel', root),
            provider: $('#nllm-provider', root),
            model: $('#nllm-model', root),
            modelList: $('#nllm-model-list', root),
            modelSave: $('#nllm-model-save', root)
        };

        el.send.addEventListener('click', function () { submit(); });
        el.input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
        });
        el.input.addEventListener('input', function () {
            el.input.style.height = 'auto';
            el.input.style.height = Math.min(el.input.scrollHeight, 140) + 'px';
        });
        el.close.addEventListener('click', closeView);
        el.clear.addEventListener('click', function () {
            S.history = []; saveHistory(); renderMessages();
            pushSystem('Sohbet temizlendi — tertemiz başlangıç.');
        });
        el.stop.addEventListener('click', function () { stopAsk(); });
        el.modelBtn.addEventListener('click', function () {
            el.modelPanel.classList.toggle('hidden');
            if (!el.modelPanel.classList.contains('hidden')) renderModelPanel();
        });
        el.provider.addEventListener('change', function () {
            fillModelList(el.provider.value);
        });
        el.modelSave.addEventListener('click', function () {
            S.providerId = el.provider.value;
            S.model = (el.model.value || '').trim();
            saveSettings();
            updateModelLabel();
            el.modelPanel.classList.add('hidden');
            pushSystem('Model seçildi: ' + currentLabel());
        });
    }

    function renderModelPanel() {
        el.provider.innerHTML = '';
        listReadyProviders().forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.short || p.id) + (p.needsKey ? '' : ' (anahtarsız)');
            if (p.id === S.providerId) opt.selected = true;
            el.provider.appendChild(opt);
        });
        // Seçili sağlayıcı listede yoksa (hazır değilse) yine göster
        var exists = listReadyProviders().some(function (p) { return p.id === S.providerId; });
        if (!exists) {
            var opt = document.createElement('option');
            opt.value = S.providerId;
            opt.textContent = providerShort(S.providerId) + ' (anahtar yok)';
            opt.selected = true;
            el.provider.appendChild(opt);
        }
        fillModelList(S.providerId);
        el.model.value = S.model;
    }

    function fillModelList(pid) {
        el.modelList.innerHTML = '';
        providerSuggestions(pid).forEach(function (m) {
            var opt = document.createElement('option');
            opt.value = m;
            el.modelList.appendChild(opt);
        });
        // Varsayılan model kutusuna öneri olarak düşsün (zorlamadan)
        if (!el.model.value.trim()) {
            var p = AI.PROVIDERS[pid] || {};
            if (p.defaultModel) el.model.placeholder = p.defaultModel;
        }
    }

    function updateModelLabel() {
        if (el && el.modelLabel) el.modelLabel.textContent = currentLabel();
    }

    function renderMessages() {
        if (!el) return;
        el.messages.innerHTML = '';
        S.history.forEach(function (m) {
            addCard(m.role === 'user' ? m.text : '', m.role === 'assistant' ? m.text : '', m.label || '');
        });
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function pushSystem(text) {
        var d = document.createElement('div');
        d.className = 'nllm-sys';
        d.textContent = text;
        el.messages.appendChild(d);
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    function addCard(q, a, label) {
        var card = document.createElement('div');
        card.className = 'nllm-card' + (q && !a ? ' nllm-card-q' : '');
        card.innerHTML =
            (q ? '<div class="nllm-q"></div>' : '') +
            (a || label ? '<div class="nllm-meta"><span class="nllm-model">' + esc(label) + '</span></div>' : '') +
            (a !== '' ? '<div class="nllm-a"></div>' : '');
        if (q) card.querySelector('.nllm-q').textContent = q;
        if (a !== '') card.querySelector('.nllm-a').textContent = a;
        el.messages.appendChild(card);
        el.messages.scrollTop = el.messages.scrollHeight;
        return card;
    }

    async function submit() {
        var q = (el.input.value || '').trim();
        if (!q || S.busy) return;
        S.busy = true;
        el.send.disabled = true;
        el.stop.classList.remove('hidden');
        el.input.value = '';
        el.input.style.height = 'auto';

        // Kullanıcı sorusu + yanıt kartı (yanıt div'i '…' placeholder'ıyla oluşsun)
        addCard(q, '', '');
        var card = addCard('', '…', currentLabel());
        var aEl = card.querySelector('.nllm-a');
        aEl.textContent = '…';

        var streamed = '';
        try {
            var out = await askLLM(q, function (delta) {
                streamed += String(delta || '');
                aEl.textContent = streamed;
                el.messages.scrollTop = el.messages.scrollHeight;
            });
            aEl.textContent = out.text;
            card.querySelector('.nllm-model').textContent = out.label;
            if (window.NesilSFX) window.NesilSFX.reply();
        } catch (err) {
            aEl.textContent = 'Hata: ' + (err && err.message ? err.message : 'bilinmeyen');
            card.querySelector('.nllm-model').textContent = currentLabel();
        } finally {
            S.busy = false;
            el.send.disabled = false;
            el.stop.classList.add('hidden');
            el.messages.scrollTop = el.messages.scrollHeight;
        }
    }

    function openView() {
        ensureDom();
        loadSettings();
        loadHistory();
        el.root.classList.remove('hidden');
        S.open = true;
        updateModelLabel();
        renderMessages();
        setTimeout(function () { el.input.focus(); }, 60);
    }
    function closeView() {
        if (!el) return;
        el.root.classList.add('hidden');
        S.open = false;
    }
    function toggleView() {
        if (S.open) closeView(); else openView();
    }

    // /llm komut yönlendirmesi — app.js bunu çağırır
    function handleCommand(body) {
        var b = String(body || '').trim().toLowerCase();
        if (b === 'on') { openView(); return 'NesilLLM açıldı. Sorunu yaz — model yanıtlar.'; }
        if (b === 'off') { closeView(); return 'NesilLLM kapatıldı.'; }
        toggleView();
        return S.open
            ? 'NesilLLM açıldı: klasik yapay zekâ sohbeti. Model düğmesinden sağlayıcı ve model seçebilirsin.'
            : 'NesilLLM kapatıldı.';
    }

    (function bindSidebarButton() {
        var btn = document.getElementById('open-nesilllm-btn');
        if (btn) btn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleView();
        });
    })();

    window.NesilLLM = {
        open: openView,
        close: closeView,
        toggle: toggleView,
        handleCommand: handleCommand,
        isOpen: function () { return !!S.open; },
        getProviderId: function () { return S.providerId; },
        getModel: function () { return S.model; },
        setModel: function (pid, model) {
            if (pid) S.providerId = pid;
            S.model = String(model || '').trim();
            saveSettings();
        },
        askLLM: askLLM,
        _test: { state: S, buildMessages: buildMessages }
    };
})();
