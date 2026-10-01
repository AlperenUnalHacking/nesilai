/* ========================================================
   NesilLLM — Yarış Uygulaması
   --------------------------------------------------------
   /llm komutuyla açılır (kenar çubuğu düğmesi de var).
   Soru iki modele paralel gider: Codestral ve MiniMax (llm7).
   Sonra jüri (llm7 "openai" meta-modeli) her iki yanıtı
   doğruluk/netlik/eksiksizlik üzerinden puanlar (0-10) ve
   yüksek puan alan yanıt kazanır.
   Kullanıcı, Ayarlar'dan eklediği kendi API modellerini de
   yarışçı listesine ekleyebilir (providerId:model biçimi).
   Hafıza: önceki soru-kazanan çiftleri yeni turn'a taşınır.
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
        racers: ['llm7:minimax-m2.7', 'llm7:codestral-latest'],
        history: [],
        turns: 0
    };
    var RACERS_KEY = 'nesilllm_racers_v1';
    var HISTORY_KEY = 'nesilllm_history_v1';
    var abortController = null;

    function $(sel, root) { return (root || document).querySelector(sel); }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function loadRacers() {
        try {
            var raw = localStorage.getItem(RACERS_KEY);
            if (raw) {
                var arr = JSON.parse(raw);
                if (Array.isArray(arr) && arr.length) {
                    // Kaldırılan llm7 modelleri (GLM, Mistral Nemo) kayıtlıysa temizle
                    arr = arr.filter(function (r) { return !/GLM|Nemo/i.test(String(r)); });
                    if (arr.length) S.racers = arr.slice(0, 4);
                }
            }
        } catch (e) { /* varsayılan kalır */ }
    }
    function saveRacers() {
        try { localStorage.setItem(RACERS_KEY, JSON.stringify(S.racers)); } catch (e) {}
    }
    function loadHistory() {
        try {
            var raw = localStorage.getItem(HISTORY_KEY);
            if (raw) {
                var arr = JSON.parse(raw);
                if (Array.isArray(arr)) S.history = arr.slice(-30);
            }
        } catch (e) { /* sıfır */ }
    }
    function saveHistory() {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(S.history.slice(-30))); } catch (e) {}
    }

    // ========================================================
    // Sağlayıcı yardımcıları
    // ========================================================
    function findUiProvider(id) {
        var list = AI.getUiProviders ? AI.getUiProviders() : [];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
    }
    function providerShort(id) {
        var p = findUiProvider(id);
        return p ? p.short : id;
    }
    function listReadyProviders() {
        var list = AI.getUiProviders ? AI.getUiProviders() : [];
        return list.filter(function (p) {
            var r = AI.isReady(p.id);
            return r && r.ok && p.id !== 'pollinations';
        });
    }
    function splitRacer(s) {
        var idx = s.indexOf(':');
        return idx < 0 ? { pid: s, model: '' } : { pid: s.slice(0, idx), model: s.slice(idx + 1) };
    }
    function joinRacer(pid, model) { return pid + ':' + model; }
    function isRacerReady(pid) {
        var r = AI.isReady(pid);
        return !!(r && r.ok);
    }
    function racerLabel(s) {
        var sp = splitRacer(s);
        return providerShort(sp.pid) + ' · ' + (sp.model || 'varsayılan');
    }

    // ========================================================
    // Sistem istemi + hafıza
    // ========================================================
    function buildSystem() {
        return 'NesilLLM yarış uygulamasın: net, doğru ve eksiksiz yanıt ver. Gereksiz uzatma, özü koru.';
    }
    function buildTurnMessages(question) {
        var msgs = [];
        S.history.forEach(function (h) {
            if (h.q && h.winner) {
                msgs.push({ role: 'user', content: h.q });
                msgs.push({ role: 'assistant', content: h.winner });
            }
        });
        msgs.push({ role: 'user', content: question });
        return msgs;
    }

    // ========================================================
    // Puanlama Jürisi
    // ========================================================
    var JUDGE_SYSTEM =
        'Sen tarafsız bir yanıt jürisisin. Kullanıcının SORUSUNA verilen iki yanıtı karşılaştır. ' +
        'Sadece geçerli JSON döndür: {"a":<0-10>,"b":<0-10>,"why":"<20 kelimeyi geçmeyen gerekçe>"} ' +
        'Kriterler: doğruluk, netlik, eksiksizlik. Başka hiçbir metin yazma.';

    function parseJudgeJson(raw) {
        var t = String(raw || '');
        var m = t.match(/\{[\s\S]*\}/);
        if (!m) return null;
        try {
            var o = JSON.parse(m[0]);
            var a = Math.max(0, Math.min(10, Math.round(Number(o.a) || 0)));
            var b = Math.max(0, Math.min(10, Math.round(Number(o.b) || 0)));
            var why = String(o.why || '').slice(0, 140);
            if (!why) why = 'Jüri gerekçe vermedi.';
            return { a: a, b: b, why: why };
        } catch (e) { return null; }
    }

    async function judgeRace(q, ra, rb, signal) {
        var judgePid = 'llm7', judgeModel = 'openai';
        if (!isRacerReady(judgePid)) {
            var ready = listReadyProviders();
            if (!ready.length) return { a: 5, b: 5, why: 'Jüri yok — ilk yanıt kazandı.' };
            judgePid = ready[0].id; judgeModel = '';
        }
        var prompt =
            'SORU: ' + q + '\n\n' +
            'YANIT A: ' + String(ra.text || '').slice(0, 2500) + '\n\n' +
            'YANIT B: ' + String(rb.text || '').slice(0, 2500) + '\n\n' +
            'İki yanıtı puanla (0-10). Sadece JSON döndür: {"a":7,"b":9,"why":"..."}';
        try {
            var res = await AI.chat({
                messages: [{ role: 'user', content: prompt }],
                providerId: judgePid,
                model: judgeModel || undefined,
                system: JUDGE_SYSTEM,
                temperature: 0.2,
                signal: signal,
                fallback: false,
                __internal: true
            });
            var text = typeof res === 'string' ? res : res.text;
            var parsed = parseJudgeJson(text);
            return parsed || { a: 5, b: 5, why: 'Jüri JSON vermedi — ilk yanıt kazandı.' };
        } catch (e) {
            return { a: 5, b: 5, why: 'Jüri çağrısı başarısız — ilk yanıt kazandı.' };
        }
    }

    // ========================================================
    // Çekirdek: Sor → Yarış → Jüri → Kazanan
    // ========================================================
    async function runRace(question, onStatus) {
        var status = onStatus || function () {};
        var racers = S.racers.filter(function (r) {
            var sp = splitRacer(r);
            return sp.pid && isRacerReady(sp.pid);
        });
        if (!racers.length) {
            throw new Error('Yarışacak hazır sağlayıcı yok. NesilLLM Ayarları → Yarışçılar.');
        }
        abortController = new AbortController();
        var signal = abortController.signal;
        var jTxt = '';

        if (racers.length === 1) {
            status('Tek yarışcı — jüri atlanıyor…', null);
            var sp1 = splitRacer(racers[0]);
            var res1 = await AI.chat({
                messages: buildTurnMessages(question),
                providerId: sp1.pid,
                model: sp1.model || undefined,
                system: buildSystem(),
                signal: signal,
                fallback: false,
                __internal: true
            });
            return {
                question: question,
                winner: typeof res1 === 'string' ? res1 : res1.text,
                winnerLabel: racerLabel(racers[0]),
                judgeText: 'Tek yarışcı: jüri devre dışı.',
                history: S.history
            };
        }

        var pair = racers.slice(0, 2);
        status('Yarış başladı: ' + racerLabel(pair[0]) + ' ⚡ ' + racerLabel(pair[1]), null);

        var calls = pair.map(function (r) {
            var sp = splitRacer(r);
            return AI.chat({
                messages: buildTurnMessages(question),
                providerId: sp.pid,
                model: sp.model || undefined,
                system: buildSystem(),
                signal: signal,
                fallback: false,
                __internal: true
            }).then(function (res) {
                return { ok: true, key: r, text: typeof res === 'string' ? res : res.text, pid: sp.pid, model: sp.model };
            }, function (err) {
                return { ok: false, key: r, pid: sp.pid, model: sp.model, err: err };
            });
        });

        var results = await Promise.all(calls);
        var okResults = results.filter(function (r) { return r.ok; });
        if (!okResults.length) {
            var e0 = results[0] && results[0].err;
            throw (e0 instanceof Error) ? e0 : new Error('Tüm yarışçılar başarısız oldu.');
        }

        var winner = okResults[0];
        if (okResults.length >= 2) {
            status('Jüri puanlıyor…', null);
            var judge = await judgeRace(question, okResults[0], okResults[1], signal);
            if (judge.b > judge.a) { winner = okResults[1]; }
            jTxt = '⚖️ Jüri: A ' + judge.a + ' — B ' + judge.b + ' — ' + judge.why;
        }

        S.turns++;
        S.history.push({
            q: String(question).slice(0, 160),
            winner: String(winner.text || '').slice(0, 400),
            t: Date.now()
        });
        saveHistory();

        return {
            question: question,
            winner: winner.text,
            winnerLabel: racerLabel(winner.key),
            judgeText: jTxt || 'Jüri devre dışı.',
            history: S.history
        };
    }

    function stopRace() {
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
                        '<span class="nllm-sub">Yarış — en iyi yanıt kazanır</span>' +
                    '</div>' +
                    '<div class="nllm-header-actions">' +
                        '<button type="button" id="nllm-settings" class="nllm-btn nllm-btn-ghost" title="Yarışçılar">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg><span>Yarışçılar</span></button>' +
                        '<button type="button" id="nllm-clear" class="nllm-btn nllm-btn-ghost" title="Hafızayı temizle">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg><span>Hafıza</span></button>' +
                        '<button type="button" id="nllm-close" class="nllm-btn nllm-btn-ghost" title="Kapat (Esc)">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg><span>Kapat</span></button>' +
                    '</div>' +
                '</header>' +
                '<div id="nllm-settings-panel" class="nllm-settings hidden">' +
                    '<h3>Yarışçılar</h3>' +
                    '<p class="nllm-set-note">İlk iki hazır yarışçı yarışır; jüri kazananı seçer. Kendi API sağlayıcın Ayarlar → Yapay Zeka bölümünden anahtarını ekledikten sonra burada listelenir.</p>' +
                    '<div id="nllm-racer-list" class="nllm-racer-list"></div>' +
                    '<div class="nllm-add-row">' +
                        '<select id="nllm-add-provider" class="nllm-select"></select>' +
                        '<input id="nllm-add-model" type="text" class="nllm-input" placeholder="model adı (örn. gpt-4o-mini)" spellcheck="false">' +
                        '<button type="button" id="nllm-add-btn" class="nllm-btn nllm-btn-accent">Ekle</button>' +
                    '</div>' +
                '</div>' +
                '<div id="nllm-messages" class="nllm-messages"></div>' +
                '<div class="nllm-composer">' +
                    '<textarea id="nllm-input" rows="1" placeholder="Sorunu yaz — iki model yarışsın…" spellcheck="false"></textarea>' +
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
            settingsBtn: $('#nllm-settings', root),
            settingsPanel: $('#nllm-settings-panel', root),
            racerList: $('#nllm-racer-list', root),
            addProvider: $('#nllm-add-provider', root),
            addModel: $('#nllm-add-model', root),
            addBtn: $('#nllm-add-btn', root)
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
            S.history = []; S.turns = 0; saveHistory(); renderMessages();
            pushSystem('Hafıza temizlendi — tertemiz başlangıç.');
        });
        el.stop.addEventListener('click', function () { stopRace(); });
        el.settingsBtn.addEventListener('click', function () {
            el.settingsPanel.classList.toggle('hidden');
            if (!el.settingsPanel.classList.contains('hidden')) renderSettings();
        });
        el.addBtn.addEventListener('click', addRacer);
    }

    function renderMessages() {
        if (!el) return;
        el.messages.innerHTML = '';
        S.history.forEach(function (h) {
            addWinnerCard(h.q, h.winner, h.label || '—', h.judge || '');
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

    function addWinnerCard(q, answer, label, judge) {
        var card = document.createElement('div');
        card.className = 'nllm-card';
        card.innerHTML =
            '<div class="nllm-q"></div>' +
            '<div class="nllm-meta"><span class="nllm-winner">🏆 ' + esc(label) + '</span>' +
            (judge ? '<span class="nllm-judge">' + esc(judge) + '</span>' : '') + '</div>' +
            '<div class="nllm-a"></div>';
        card.querySelector('.nllm-q').textContent = q;
        card.querySelector('.nllm-a').textContent = answer;
        el.messages.appendChild(card);
        el.messages.scrollTop = el.messages.scrollHeight;
        return card;
    }

    function renderSettings() {
        // Yarışçı listesi
        el.racerList.innerHTML = '';
        S.racers.forEach(function (r, i) {
            var sp = splitRacer(r);
            var ready = isRacerReady(sp.pid);
            var row = document.createElement('div');
            row.className = 'nllm-racer-row' + (ready ? '' : ' nllm-racer-off');
            row.innerHTML =
                '<span class="nllm-racer-name">' + esc(providerShort(sp.pid)) + '</span>' +
                '<span class="nllm-racer-model">' + esc(sp.model || 'varsayılan') + '</span>' +
                '<span class="nllm-racer-state">' + (ready ? 'hazır' : 'anahtar yok') + '</span>' +
                '<button type="button" class="nllm-racer-del" data-i="' + i + '" title="Kaldır">✕</button>';
            row.querySelector('.nllm-racer-del').addEventListener('click', function () {
                S.racers.splice(i, 1); saveRacers(); renderSettings();
            });
            el.racerList.appendChild(row);
        });
        // Sağlayıcı seçimi
        el.addProvider.innerHTML = '';
        var ready = listReadyProviders();
        ready.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.short || p.id;
            el.addProvider.appendChild(opt);
        });
    }

    function addRacer() {
        var pid = el.addProvider.value;
        var model = (el.addModel.value || '').trim();
        if (!pid) return;
        var entry = model ? joinRacer(pid, model) : pid + ':';
        if (S.racers.indexOf(entry) !== -1) { pushSystem('Bu yarışçı zaten listede.'); return; }
        S.racers.push(entry);
        S.racers = S.racers.slice(-4);
        saveRacers();
        el.addModel.value = '';
        renderSettings();
    }

    async function submit() {
        var q = (el.input.value || '').trim();
        if (!q || S.busy) return;
        S.busy = true;
        el.send.disabled = true;
        el.stop.classList.remove('hidden');
        el.input.value = '';
        el.input.style.height = 'auto';

        var card = addWinnerCard(q, '…', 'yarış sürüyor', '');
        var aEl = card.querySelector('.nllm-a');
        var metaEl = card.querySelector('.nllm-meta .nllm-winner');

        var setStatus = function (txt) {
            aEl.textContent = txt;
        };
        try {
            var out = await runRace(q, function (txt) {
                setStatus(txt);
                if (txt && txt.indexOf('⚖️') === 0) {
                    var jEl = card.querySelector('.nllm-judge');
                    if (jEl) jEl.textContent = txt;
                }
            });
            card.querySelector('.nllm-a').textContent = out.winner;
            metaEl.textContent = '🏆 ' + out.winnerLabel;
            var jEl2 = card.querySelector('.nllm-judge');
            if (jEl2) jEl2.textContent = out.judgeText;
            // Kalıcı geçmişe etiketleri işle
            var lastH = S.history[S.history.length - 1];
            if (lastH) { lastH.label = out.winnerLabel; lastH.judge = out.judgeText; saveHistory(); }
            if (window.NesilSFX) window.NesilSFX.reply();
        } catch (err) {
            card.querySelector('.nllm-a').textContent = 'Hata: ' + (err && err.message ? err.message : 'bilinmeyen');
            metaEl.textContent = '⚠️ Yarış tamamlanamadı';
        } finally {
            S.busy = false;
            el.send.disabled = false;
            el.stop.classList.add('hidden');
            el.messages.scrollTop = el.messages.scrollHeight;
        }
    }

    function openView() {
        ensureDom();
        loadRacers();
        loadHistory();
        el.root.classList.remove('hidden');
        S.open = true;
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
        if (b === 'on') { openView(); return 'NesilLLM açıldı. Sorunu yaz — iki model yarışsın.'; }
        if (b === 'off') { closeView(); return 'NesilLLM kapatıldı.'; }
        toggleView();
        return S.open
            ? 'NesilLLM açıldı: Codestral ve MiniMax yarışır, jüri en iyisini seçer. Kendi API modellerini de Yarışçılar bölümünden ekleyebilirsin.'
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
        getRacers: function () { return S.racers.slice(); },
        setRacers: function (arr) {
            if (Array.isArray(arr) && arr.length) { S.racers = arr.slice(0, 4); saveRacers(); }
        },
        runRace: runRace,
        _test: { state: S, parseJudgeJson: parseJudgeJson }
    };
})();
