/* ========================================================
   NesilCode — Yapay Zeka Kodlama Uygulaması
   --------------------------------------------------------
   Freebuff / Cloud Code / Codex / Anti-Gravity benzeri,
   yalnızca kodlamaya odaklı yerel ajan modu.

   - /nesilcode komutu ile açılır (kenar çubuğu düğmesi de var)
   - Dosya sistemi: PC'de gerçek disk (IPC köprüsü),
     web'de aynı tarayıcı sekmesi içinde sanal proje klasörü
   - Ajan: NesilAI modelleriyle (ai.js — LLM7 → Pollinations zinciri)
     PLAN → AKSİYON döngüsüyle proje dosyalarını okur, yazar,
     oluşturur, siler; kod içeriği ASLA sohbete sızmaz
   - Ultra Code: tek tuşla projeyi inceleyip iyileştirme turu
   ======================================================== */
(function () {
    'use strict';

    // ========================================================
    // Yardımcılar
    // ========================================================
    var LOG_LIMIT = 240;
    var MAX_STEPS = 24;          // ajanın tek görevde alabileceği araç adımı üst sınırı
    var HISTORY_TURNS = 4;       // son N tur yeni göreve taşınır (bağlam sürekliliği)
    var logEntries = [];

    function $(sel, root) { return (root || document).querySelector(sel); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var ICONS = {
        image:  '<svg class="icon" aria-hidden="true"><use href="#i-image"/></svg>',
        doc:    '<svg class="icon" aria-hidden="true"><use href="#i-doc"/></svg>',
        gear:   '<svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg>',
        paint:  '<svg class="icon" aria-hidden="true"><use href="#i-palette"/></svg>',
        code:   '<svg class="icon" aria-hidden="true"><use href="#i-code"/></svg>',
        puzzle: '<svg class="icon" aria-hidden="true"><use href="#i-puzzle"/></svg>',
        file:   '<svg class="icon" aria-hidden="true"><use href="#i-file"/></svg>',
        folder: '<svg class="icon" aria-hidden="true"><use href="#i-folder"/></svg>',
        edit:   '<svg class="icon" aria-hidden="true"><use href="#i-edit"/></svg>',
        trash:  '<svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>',
        check:  '<svg class="icon" aria-hidden="true"><use href="#i-check-circle"/></svg>',
        alert:  '<svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg>',
        zap:    '<svg class="icon" aria-hidden="true"><use href="#i-zap"/></svg>',
        user:   '<svg class="icon" aria-hidden="true"><use href="#i-user"/></svg>',
        stop:   '<svg class="icon" aria-hidden="true"><use href="#i-stop"/></svg>',
        plus:   '<svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg>',
        eye:    '<svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg>',
        pen:    '<svg class="icon" aria-hidden="true"><use href="#i-pen"/></svg>'
    };

    function fileIcon(name) {
        var n = String(name || '').toLowerCase();
        if (/\.(png|jpe?g|gif|webp|svg|ico)$/.test(n)) return ICONS.image;
        if (/\.(md|txt)$/.test(n)) return ICONS.doc;
        if (/\.(json|ya?ml|toml|ini|env|lock)$/.test(n)) return ICONS.gear;
        if (/\.(html?|css|scss)$/.test(n)) return ICONS.paint;
        if (/\.(js|ts|mjs|cjs|jsx|tsx)$/.test(n)) return ICONS.code;
        if (/\.(py|rb|php|java|cs|go|rs|c|cpp|h|sh|bat|ps1)$/.test(n)) return ICONS.puzzle;
        return ICONS.file;
    }

    function fmtSize(bytes) {
        var b = Number(bytes) || 0;
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
    }

    function joinPath(dir, name) {
        var d = String(dir || '');
        if (!d) return name;
        return d.replace(/[\\/]+$/, '') + '/' + name;
    }

    function parentPath(p) {
        var s = String(p || '').replace(/[\\/]+$/, '');
        var i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
        return i <= 0 ? '' : s.slice(0, i);
    }

    function baseName(p) {
        var s = String(p || '').replace(/[\\/]+$/, '');
        var i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
        return i < 0 ? s : s.slice(i + 1);
    }

    function log(kind, text) {
        logEntries.push({ kind: kind, text: text, t: Date.now() });
        if (logEntries.length > LOG_LIMIT) logEntries.shift();
        renderLog();
    }

    // Sohbet baloncukları için mini markdown: kaçır → satır içi kod / kalın / liste
    // Not: mesaj metinlerine gömülü güvenilir ikonlar (ICONS) kaçıştan sonra geri açılır;
    // desen tamamen bizim ürettiğimiz biçimle eşleşir, sembol adı [a-z-] ile sınırlıdır.
    var ICON_UNESC_RE = /&lt;svg class=&quot;icon&quot; aria-hidden=&quot;true&quot;&gt;&lt;use href=&quot;#i-([a-z-]+)&quot;\/&gt;&lt;\/svg&gt;/g;
    function mdLite(s) {
        var t = esc(s);
        t = t.replace(ICON_UNESC_RE, function (_, name) { return ICONS[name] || ''; });
        t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/^#{2,3}\s+(.*)$/gm, '<span class="nc-md-h">$1</span>');
        t = t.replace(/^-\s+(.*)$/gm, '<span class="nc-md-li">• $1</span>');
        t = t.replace(/\n/g, '<br>');
        return t;
    }

    // ========================================================
    // Dosya Sistemi Katmanı
    // --------------------------------------------------------
    // PC (Electron): window.nesilaiCode → gerçek disk IPC'si
    // Web: aynı sekmede yaşayan sanal proje (localStorage kalıcı)
    // ========================================================
    var VFS_KEY = 'nesilcode_vfs_v1';
    var DESKTOP = !!(window.nesilaiCode && window.nesilaiCode.fsAvailable);

    var webFs = null;
    function getWebFs() {
        if (webFs) return webFs;
        var root = {};
        try {
            var raw = localStorage.getItem(VFS_KEY);
            if (raw) root = JSON.parse(raw) || {};
        } catch (e) { root = {}; }

        function persist() {
            try { localStorage.setItem(VFS_KEY, JSON.stringify(root)); } catch (e) { /* kota */ }
        }
        function split(p) {
            var parts = String(p || '').split('/').filter(Boolean);
            var node = root;
            for (var i = 0; i < parts.length; i++) {
                var k = parts[i];
                if (i === parts.length - 1) return { node: node, key: k };
                if (!node[k] || typeof node[k] !== 'object' || node[k].__isFile) node[k] = {};
                node = node[k];
            }
            return { node: node, key: '' };
        }
        function nodeAt(p) {
            var parts = String(p || '').split('/').filter(Boolean);
            var node = root;
            for (var i = 0; i < parts.length; i++) {
                if (!node || typeof node !== 'object') return undefined;
                node = node[parts[i]];
            }
            return node;
        }
        webFs = {
            label: 'Sanal proje (web)',
            init: function () { return Promise.resolve(); },
            pickDir: function () { return Promise.resolve(true); },
            readDir: function (p) {
                var parts = String(p || '').split('/').filter(Boolean);
                var node = root;
                for (var i = 0; i < parts.length; i++) {
                    node = node ? node[parts[i]] : undefined;
                    if (!node || node.__isFile) return Promise.reject(new Error('Klasör bulunamadı: ' + p));
                }
                var out = [];
                Object.keys(node || {}).forEach(function (k) {
                    var v = node[k];
                    out.push(v && v.__isFile
                        ? { name: k, type: 'file', size: (v.content || '').length }
                        : { name: k, type: 'dir' });
                });
                out.sort(function (a, b) {
                    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
                return Promise.resolve(out);
            },
            readFile: function (p) {
                var n = nodeAt(p);
                if (!n || !n.__isFile) return Promise.reject(new Error('Dosya bulunamadı: ' + p));
                return Promise.resolve(String(n.content || ''));
            },
            writeFile: function (p, content) {
                var s = split(p);
                if (!s.key) return Promise.reject(new Error('Geçersiz dosya yolu'));
                s.node[s.key] = { __isFile: true, content: String(content) };
                persist();
                return Promise.resolve(true);
            },
            mkdir: function (p) {
                var s = split(p);
                if (s.key) s.node[s.key] = s.node[s.key] || {};
                persist();
                return Promise.resolve(true);
            },
            remove: function (p) {
                var s = split(p);
                if (!s.key || !s.node[s.key]) return Promise.reject(new Error('Silinemedi: ' + p));
                delete s.node[s.key];
                persist();
                return Promise.resolve(true);
            }
        };
        return webFs;
    }

    var desktopFs = null;
    function getDesktopFs() {
        if (desktopFs) return desktopFs;
        var b = window.nesilaiCode;
        desktopFs = {
            label: b.rootLabel || 'Proje klasörü (disk)',
            init: function () { return b.fsInit(); },
            pickDir: function () { return b.fsPickDir(); },
            readDir: function (p) { return b.fsReadDir(p == null ? '' : p); },
            readFile: function (p) { return b.fsReadFile(p); },
            writeFile: function (p, content) { return b.fsWriteFile(p, content); },
            mkdir: function (p) { return b.fsMkdir(p); },
            remove: function (p) { return b.fsRemove(p); }
        };
        return desktopFs;
    }

    function getFs() { return DESKTOP ? getDesktopFs() : getWebFs(); }

    // Uygulama yeniden başladığında masaüstünde klasör bağlantısı kopar
    // (main süreci sıfırlanır) — rootInfo ile etiketi/bağlantıyı tazele.
    function initFs() {
        var fs = getFs();
        if (fs._initPromise) return fs._initPromise;
        fs._initPromise = Promise.resolve(fs.init()).then(function (r) {
            if (DESKTOP && window.nesilaiCode && typeof window.nesilaiCode.rootInfo === 'function') {
                return Promise.resolve(window.nesilaiCode.rootInfo()).then(function (info) {
                    if (info && info.connected && info.label) fs.label = info.label;
                    return r;
                }).catch(function () { return r; });
            }
            return r;
        });
        return fs._initPromise;
    }

    // ========================================================
    // İzinler — Yazma / Okuma / Oluşturma / Silme / Düzenleme
    // Kapalı olan işlem ajan için de, gezgin için de kilitlidir.
    // ========================================================
    var PERMS_KEY = 'nesilcode_perms_v1';
    var PERM_DEFS = [
        { key: 'write',  label: 'Yazma',     icon: 'edit',  hint: 'Mevcut dosyalara tam yazım' },
        { key: 'read',   label: 'Okuma',     icon: 'eye',   hint: 'Dosya ve klasörleri oku' },
        { key: 'create', label: 'Oluşturma', icon: 'plus',  hint: 'Yeni dosya / klasör oluştur' },
        { key: 'del',    label: 'Silme',     icon: 'trash', hint: 'Dosya ve klasör sil' },
        { key: 'patch',  label: 'Düzenleme', icon: 'pen',   hint: 'Küçük yamalar uygula' }
    ];

    function loadPerms() {
        var p = { write: true, read: true, create: true, del: true, patch: true };
        try {
            var raw = localStorage.getItem(PERMS_KEY);
            if (raw) {
                var o = JSON.parse(raw) || {};
                PERM_DEFS.forEach(function (d) {
                    if (typeof o[d.key] === 'boolean') p[d.key] = o[d.key];
                });
            }
        } catch (e) { /* bozuk kayıt — varsayılanlar */ }
        return p;
    }

    function savePerms() {
        try { localStorage.setItem(PERMS_KEY, JSON.stringify(S.permissions)); } catch (e) { /* kota */ }
    }

    function permLabel(key) {
        for (var i = 0; i < PERM_DEFS.length; i++) if (PERM_DEFS[i].key === key) return PERM_DEFS[i].label;
        return key;
    }

    // ========================================================
    // Durum
    // ========================================================
    var S = {
        open: false,
        tree: {},          // path -> entries (yüklenmiş klasörler)
        expanded: { '': true },
        selected: null,
        busy: false,
        mode: 'idle',      // idle | ultra
        messages: [],
        pendingOps: [],
        opsDone: 0,
        opsFailed: 0,
        filter: '',        // gezgin arama filtresi
        stopRequested: false,
        agentState: '',
        runId: 0,          // ajan turu kimliği — force-finish eskilerini geçersiz kılar
        history: [],       // ajanla son diyalog (yeni göreve bağlam taşır)
        permissions: { write: true, read: true, create: true, del: true, patch: true },
        permDenied: 0      // görev içinde izin reddi sayacı
    };
    S.permissions = loadPerms();

    function pushHistory(userText, assistantText) {
        S.history.push({ role: 'user', content: String(userText || '').slice(0, 4000) });
        S.history.push({ role: 'assistant', content: String(assistantText || '').slice(0, 2000) });
        if (S.history.length > HISTORY_TURNS * 2) S.history = S.history.slice(-HISTORY_TURNS * 2);
    }

    // ========================================================
    // Sistem İstemi — ajanın dili
    // ========================================================
    var AGENT_SYSTEM = [
        'Sen NesilCode’sun: NesilAI altyapısı üzerinde çalışan, dosya sistemi erişimi olan bir kodlama ajanısın.',
        'Her yanıtı SADECE aşağıdaki blok biçiminde ver; düz metin yazma.',
        '',
        'PLAN:',
        '<yapılacakları madde madde yaz>',
        'AKSİYON: {"op":"list","path":"klasör"}',
        'AKSİYON: {"op":"read","path":"dosya"}',
        'AKSİYON: {"op":"write","path":"dosya","content":"tam dosya içeriği"}',
        'AKSİYON: {"op":"patch","path":"dosya","find":"değişecek kesin metin","replace":"yeni metin","replaceAll":false}',
        'AKSİYON: {"op":"mkdir","path":"klasör"}',
        'AKSİYON: {"op":"delete","path":"dosya veya klasör"}',
        'AKSİYON: {"op":"done","summary":"kullanıcıya kısa özet"}',
        '',
        'Kurallar:',
        '- Önce list/read ile projeyi anla; gerekmedikçe dosya silme.',
        '- write içeriği TAM dosya olmalı (parça değil). Kod içeriğini yanıt metninde asla gösterme.',
        '- Küçük değişikliklerde write yerine patch kullan: find, dosyadaki kesin ve tek bir metin olmalı.',
        '- Her turda en fazla 1 AKSİYON ver; iş bitince done bloğuyla bitir.',
        '- done.summary kısa ve kullanıcı dostu olsun (ne yaptın, sonraki adım ne).',
        '- Ultra Code modunda: list ile projeyi tara → iyileştirmeleri tek tek uygula → done ile özetle.'
    ].join('\n');

    // ========================================================
    // Ajan Çekirdeği — PLAN/AKSİYON döngüsü
    // ========================================================
    // AKSİYON bloğunu süslü parantez dengesiyle çıkar — iç içe `}` içeren
    // kod içeriklerinde tembel regex bozulur; string durumu takip ederek
    // eşleşen kapanış parantezini bulur.
    // JSON.parse patlarsa (model gerçek satır sonları / yarı kesilmiş yanıt
    // verdiğinde yaygındır) onarıp yeniden dener — aksi hâlde kod sohbete akar.
    function repairJsonCandidate(raw) {
        var s = String(raw || '');
        // 1) string dışındaki gerçek satır sonlarını kaçışa çevir
        var out = '';
        var inStr = false, escp = false;
        for (var i = 0; i < s.length; i++) {
            var ch = s[i];
            if (inStr) {
                if (escp) { out += ch; escp = false; continue; }
                if (ch === '\\') { out += ch; escp = true; continue; }
                if (ch === '"') { inStr = false; out += ch; continue; }
                if (ch === '\n') { out += '\\n'; continue; }
                if (ch === '\r') { out += ''; continue; }
                if (ch === '\t') { out += '\\t'; continue; }
                out += ch;
            } else {
                if (ch === '"') inStr = true;
                out += ch;
            }
        }
        // 2) yarım kalmış string/kapanışları tamamla (stream kesintisi)
        var tail = '';
        if (inStr) tail += '"';
        if (out.replace(/\\./g, '').split('{').length > out.replace(/\\./g, '').split('}').length) tail += '}';
        return out + tail;
    }

    function extractAction(text) {
        var t = String(text || '');
        var re = /AKS[İI]YON:/gi;
        var m;
        while ((m = re.exec(t)) !== null) {
            var start = t.indexOf('{', m.index);
            if (start === -1) return null;
            var depth = 0, inStr = false, escp = false;
            var closed = false;
            for (var i = start; i < t.length; i++) {
                var ch = t[i];
                if (inStr) {
                    if (escp) escp = false;
                    else if (ch === '\\') escp = true;
                    else if (ch === '"') inStr = false;
                } else {
                    if (ch === '"') inStr = true;
                    else if (ch === '{') depth++;
                    else if (ch === '}') {
                        depth--;
                        if (depth === 0) {
                            closed = true;
                            var raw = t.slice(start, i + 1);
                            var parsed = null;
                            try { parsed = JSON.parse(raw); } catch (e1) {
                                try { parsed = JSON.parse(repairJsonCandidate(raw)); } catch (e2) { parsed = null; }
                            }
                            if (parsed && parsed.op) return parsed;
                            break;
                        }
                    }
                }
            }
            if (!closed) {
                // Akış yarıda kesilmiş (string/kapanış eksik) — onarıp dene
                var repaired = null;
                try { repaired = JSON.parse(repairJsonCandidate(t.slice(start))); } catch (e3) { repaired = null; }
                if (repaired && repaired.op) return repaired;
            }
        }
        return null;
    }

    // patch için: find bloğunu kaçışsız, kesin olarak bulup değiştirir
    function applyPatch(content, find, replace, replaceAll) {
        var c = String(content == null ? '' : content);
        var f = String(find == null ? '' : find);
        var r = String(replace == null ? '' : replace);
        if (!f) throw new Error('patch: "find" boş olamaz');
        var i = c.indexOf(f);
        if (i === -1) throw new Error('patch: bulunamadı — "find" dosyayla birebir eşleşmiyor');
        if (replaceAll) return c.split(f).join(r);
        var second = c.indexOf(f, i + 1);
        if (second !== -1) throw new Error('patch: "find" birden çok yerde geçiyor; find\'ı genişlet veya replaceAll kullan');
        return c.slice(0, i) + r + c.slice(i + f.length);
    }

    // op → gereken izin
    var OP_PERM = { list: 'read', read: 'read', write: 'write', patch: 'patch', mkdir: 'create', delete: 'del' };

    function opLabel(op) {
        var map = {
            list:   ICONS.folder + ' listelendi',
            read:   ICONS.file  + ' okundu',
            write:  ICONS.edit  + ' yazıldı',
            patch:  ICONS.edit  + ' düzenlendi',
            mkdir:  ICONS.folder + ' klasör oluşturuldu',
            delete: ICONS.trash + ' silindi',
            done:   ICONS.check + ' tamamlandı'
        };
        return map[op.op] || esc(op.op);
    }

    // izin kapısı: kapalıysa ret — hem ajan hem gezgin bu kapıdan geçer
    function checkPerm(op) {
        var need = OP_PERM[op.op];
        if (!need) return { ok: true };
        if (S.permissions[need]) return { ok: true };
        return { ok: false, need: need };
    }

    function runOp(op) {
        var gate = checkPerm(op);
        if (!gate.ok) {
            S.permDenied++;
            return Promise.reject(new Error('İzin kapalı: ' + permLabel(gate.need) + ' (İzinler panelinden açabilirsin)'));
        }
        var fs = getFs();
        switch (op.op) {
            case 'list':
                return fs.readDir(op.path || '').then(function (entries) {
                    var lines = entries.map(function (e) {
                        return (e.type === 'dir' ? 'DIR  ' : 'FILE ') + joinPath(op.path || '', e.name) +
                            (e.type === 'file' && e.size != null ? ' (' + fmtSize(e.size) + ')' : '');
                    });
                    return { ok: true, tool: 'list', detail: (op.path || '.'), result: lines.join('\n') || '(boş klasör)' };
                });
            case 'read':
                return fs.readFile(op.path).then(function (content) {
                    return { ok: true, tool: 'read', detail: op.path, result: String(content || '') };
                });
            case 'write':
                return fs.writeFile(op.path, op.content || '').then(function () {
                    return { ok: true, tool: 'write', detail: op.path, result: 'Dosya yazıldı (' + fmtSize((op.content || '').length) + ')' };
                });
            case 'patch':
                return fs.readFile(op.path).then(function (oldContent) {
                    var next = applyPatch(oldContent, op.find, op.replace, op.replaceAll === true);
                    return fs.writeFile(op.path, next).then(function () {
                        return { ok: true, tool: 'patch', detail: op.path, result: 'Yama uygulandı (' + oldContent.length + ' → ' + next.length + ' karakter)' };
                    });
                });
            case 'mkdir':
                return fs.mkdir(op.path).then(function () {
                    return { ok: true, tool: 'mkdir', detail: op.path, result: 'Klasör hazır: ' + op.path };
                });
            case 'delete':
                return fs.remove(op.path).then(function () {
                    return { ok: true, tool: 'delete', detail: op.path, result: 'Silindi' };
                });
            default:
                return Promise.reject(new Error('Bilinmeyen işlem: ' + op.op));
        }
    }

    function callModel(messages) {
        var ai = window.NesilAI;
        if (!ai || !ai.chat) return Promise.reject(new Error('NesilAI motoru (ai.js) yüklenmemiş.'));
        return ai.chat({
            messages: messages,
            system: AGENT_SYSTEM + '\n\n' + permsLine(),
            temperature: 0.15,
            maxTokens: 8192   // uzun dosya yazımlarının yarım kalmaması için
        });
    }

    function agentLoop(userText, mode) {
        if (S.busy) return;
        S.busy = true;
        S.mode = mode || 'idle';
        S.opsDone = 0;
        S.opsFailed = 0;
        S.pendingOps = [];
        S.stopRequested = false;
        S.agentState = '';
        S.permDenied = 0;
        renderState();
        renderMessages();

        var msgs = S.history.slice();
        msgs.push({ role: 'user', content: userText });
        var steps = 0;
        var runId = ++S.runId;   // force-finish bu id'yi artırır; bekleyen adımlar geçersiz olur

        function step() {
            if (runId !== S.runId) return;              // tur zorla bitirildi
            if (S.stopRequested) { finishStop(); return; }
            if (++steps > MAX_STEPS) {
                addAssistantMessage('Görev çok uzun sürdü, güvenlik sınırında durdurdum. Kalan kısmı yeni bir görevle sürdürebilirsin.');
                finish();
                return;
            }
            setAgentState('Düşünüyor…');
            return callModel(msgs).then(function (answer) {
                if (runId !== S.runId) return;
                if (S.stopRequested) { finishStop(); return; }
                var text = (answer && (answer.text || answer.content)) || String(answer || '');
                var action = extractAction(text);
                if (!action) {
                    addAssistantMessage(text || 'Bir şeyler ters gitti, tekrar dener misin?');
                    pushHistory(userText, text);
                    finish();
                    return;
                }
                if (action.op === 'done') {
                    addAssistantMessage(action.summary || 'Tamamlandı.');
                    pushHistory(userText, action.summary || 'Tamamlandı.');
                    finish();
                    return;
                }
                // Araç adımı: çalıştır, sonucu modele geri ver, tur devam etsin
                log(action.op, action.path || '');
                setAgentState(action.op + ': ' + (action.path || '…'));
                var gate = checkPerm(action);
                if (!gate.ok) {
                    S.permDenied++;
                    addSystemMessage(ICONS.alert + ' ' + esc(action.op) + ' reddedildi — ' + esc(permLabel(gate.need)) + ' izni kapalı.');
                    renderState();
                    msgs.push({ role: 'assistant', content: text });
                    msgs.push({
                        role: 'user',
                        content: 'İZİN REDDİ [' + action.op + ' ' + (action.path || '') + ']: "' + permLabel(gate.need) +
                            '" izni kullanıcı tarafından kapatılmış. Bu işlemi yapma; başka bir yolla devam et veya done ile bitir.'
                    });
                    return step();
                }
                return runOp(action).then(function (res) {
                    if (runId !== S.runId) return;
                    S.opsDone++;
                    addSystemMessage(opLabel(action) + ' — ' + esc(action.path || ''));
                    renderState();
                    if (action.op === 'write' || action.op === 'delete' || action.op === 'mkdir' || action.op === 'patch') scheduleTreeRefresh();
                    msgs.push({ role: 'assistant', content: text });
                    msgs.push({
                        role: 'user',
                        content: 'ARAÇ SONUCU [' + action.op + ' ' + (action.path || '') + ']:\n' + res.result
                    });
                    return step();
                }).catch(function (err) {
                    if (runId !== S.runId) return;
                    S.opsFailed++;
                    addSystemMessage(ICONS.alert + ' ' + esc(action.op || '?') + ' başarısız: ' + esc(err && err.message ? err.message : err));
                    renderState();
                    msgs.push({ role: 'assistant', content: text });
                    msgs.push({
                        role: 'user',
                        content: 'ARAÇ HATASI [' + action.op + ' ' + (action.path || '') + ']: ' +
                            (err && err.message ? err.message : err) + '. Farklı bir yolla devam et veya done ile bitir.'
                    });
                    return step();
                });
            }).catch(function (err) {
                if (runId !== S.runId) return;
                addAssistantMessage('Model hatası: ' + (err && err.message ? err.message : err));
                finish();
            });
        }
        return step();
    }

    var stopTimer = null;
    function requestStop() {
        if (!S.busy || S.stopRequested) return;
        S.stopRequested = true;
        setAgentState('Durduruluyor…');
        log('warn', 'Durdurma istendi');
        // Model yanıtı takılırsa (ağ donması vb.) 8 sn sonra zorla bitir —
        // aksi hâlde durdurma bayrağı yalnızca promise çözülünce işler.
        if (stopTimer) clearTimeout(stopTimer);
        stopTimer = setTimeout(function () {
            stopTimer = null;
            if (S.busy && S.stopRequested) {
                S.runId++;   // bekleyen tüm adımları geçersiz kıl
                addAssistantMessage(ICONS.stop + ' Durdurdum. İstediğin zaman devam edebilirsin.');
                finish();
            }
        }, 8000);
    }

    function finishStop() {
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
        if (!S.busy) return;
        addAssistantMessage(ICONS.stop + ' Durdurdum. İstediğin zaman devam edebilirsin.');
        finish();
    }

    function finish() {
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
        S.busy = false;
        S.mode = 'idle';
        S.agentState = '';
        renderState();
        renderMessages();
    }

    function setAgentState(s) {
        S.agentState = String(s || '');
        var t = el && el.messages ? el.messages.querySelector('.nc-typing em') : null;
        if (t && S.busy) t.textContent = S.agentState || '…';
    }

    // Ajan dosya yazdıkça/sildikçe ağacı tazeler (görsel titreşimi önlemek için gecikmeli)
    var treeRefreshTimer = null;
    function scheduleTreeRefresh() {
        if (!S.open) return;
        if (treeRefreshTimer) clearTimeout(treeRefreshTimer);
        treeRefreshTimer = setTimeout(function () {
            treeRefreshTimer = null;
            refreshTree();
        }, 350);
    }

    // ========================================================
    // Sohbet Durumu Render
    // ========================================================
    function addAssistantMessage(text) {
        S.messages.push({ role: 'assistant', text: text, t: Date.now() });
        renderMessages();
    }
    function addSystemMessage(text) {
        S.messages.push({ role: 'system', text: text, t: Date.now() });
        renderMessages();
    }
    function addUserMessage(text) {
        S.messages.push({ role: 'user', text: text, t: Date.now() });
        renderMessages();
    }

    // ========================================================
    // Arayüz Kurulumu
    // ========================================================
    var el = null;

    function ensureDom() {
        if (el && el.root && document.body.contains(el.root)) return;
        var root = document.createElement('div');
        root.id = 'nesilcode-root';
        root.className = 'nc hidden';
        root.innerHTML =
            '<div class="nc-shell">' +
                '<header class="nc-header">' +
                    '<div class="nc-brand">' +
                        '<svg class="icon" aria-hidden="true"><use href="#i-code"/></svg>' +
                        '<strong>NesilCode</strong>' +
                        '<span class="nc-sub">NesilAI kodlama ajanı</span>' +
                    '</div>' +
                    '<div class="nc-header-actions">' +
                        '<button type="button" id="nc-pick-dir" class="nc-btn nc-btn-ghost" title="Proje klasörü seç">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-folder"/></svg><span>Klasör</span></button>' +
                        '<button type="button" id="nc-close" class="nc-btn nc-btn-ghost" title="Kapat (Esc)">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button>' +
                    '</div>' +
                '</header>' +
                '<div class="nc-body">' +
                    '<aside class="nc-explorer">' +
                        '<div class="nc-explorer-head">' +
                            '<span id="nc-root-label">Proje</span>' +
                            '<span id="nc-op-count" class="nc-opcount">0 işlem</span>' +
                        '</div>' +
                        '<div class="nc-search" id="nc-search-box">' +
                            '<svg class="icon" aria-hidden="true"><use href="#i-search"/></svg>' +
                            '<input id="nc-search" type="text" placeholder="Dosya ara…" spellcheck="false" autocomplete="off">' +
                            '<button type="button" id="nc-search-clear" class="nc-search-clear" title="Aramayı temizle">' +
                                '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button>' +
                        '</div>' +
                        '<div id="nc-tree" class="nc-tree"></div>' +
                        '<div class="nc-explorer-foot">' +
                            '<button type="button" id="nc-new-file" class="nc-btn nc-btn-ghost" title="Yeni dosya oluştur">' +
                                '<svg class="icon" aria-hidden="true"><use href="#i-file"/></svg><span>Yeni Dosya</span></button>' +
                            '<button type="button" id="nc-perms" class="nc-btn nc-btn-ghost" title="Ajan izinlerini yönet">' +
                                '<svg class="icon" aria-hidden="true"><use href="#i-settings"/></svg><span>İzinler</span></button>' +
                            '<button type="button" id="nc-ultra" class="nc-btn nc-btn-ultra" title="Projeyi incele, iyileştir">' +
                                '<svg class="icon" aria-hidden="true"><use href="#i-bolt"/></svg><span>Ultra Code</span></button>' +
                        '</div>' +
                        '<div id="nc-perm-panel" class="nc-perm-panel hidden">' +
                            '<div class="nc-perm-head">Ajan İzinleri</div>' +
                            '<div id="nc-perm-list"></div>' +
                        '</div>' +
                    '</aside>' +
                    '<section class="nc-chat">' +
                        '<div id="nc-messages" class="nc-messages">' +
                            '<div class="nc-welcome">' +
                                '<p><strong>NesilCode</strong> açık — proje dosyalarını okuyabilir, yazabilir, oluşturabilir ve silebilir.</p>' +
                                '<p>Kod içeriği sohbette gösterilmez; ajan dosyaları doğrudan oluşturur. Ne yaptığını <em>işlem günlüğünden</em> izleyebilirsin.</p>' +
                                '<p>Örnekler: <em>“Bir hesap makinesi uygulaması oluştur”</em> · <em>“style.css’i mobil için düzenle”</em> · <em>“Kullanılmayan dosyaları temizle”</em></p>' +
                            '</div>' +
                        '</div>' +
                        '<form id="nc-form" class="nc-composer" autocomplete="off">' +
                            '<textarea id="nc-input" rows="1" placeholder="NesilCode’a bir görev ver…"></textarea>' +
                            '<button type="button" id="nc-stop" class="nc-btn nc-btn-stop" title="Durdur">' +
                                '<svg class="icon" aria-hidden="true"><use href="#i-stop"/></svg></button>' +
                            '<button type="submit" id="nc-send" class="nc-btn nc-btn-send" title="Gönder">' +
                                '<svg class="icon" aria-hidden="true"><use href="#i-send"/></svg></button>' +
                        '</form>' +
                    '</section>' +
                    '<aside class="nc-activity">' +
                        '<div class="nc-activity-head">İşlem Günlüğü</div>' +
                        '<div id="nc-log" class="nc-log"></div>' +
                    '</aside>' +
                '</div>' +
            '</div>';
        document.body.appendChild(root);
        el = {
            root: root,
            messages: $('#nc-messages', root),
            log: $('#nc-log', root),
            tree: $('#nc-tree', root),
            input: $('#nc-input', root),
            send: $('#nc-send', root),
            stopBtn: $('#nc-stop', root),
            opCount: $('#nc-op-count', root),
            rootLabel: $('#nc-root-label', root),
            search: $('#nc-search', root),
            searchBox: $('#nc-search-box', root),
            permPanel: $('#nc-perm-panel', root),
            permList: $('#nc-perm-list', root)
        };
        bindEvents();
        refreshTree();
        renderLog();
        renderMessages();
    }

    function closeView() {
        if (!el || !el.root) return;
        el.root.classList.add('hidden');
        S.open = false;
    }

    function openView() {
        ensureDom();
        el.root.classList.remove('hidden');
        S.open = true;
        refreshTree();
        setTimeout(function () { if (el && el.input) el.input.focus(); }, 60);
    }

    function toggleView() {
        if (S.open) closeView();
        else openView();
    }

    function refreshTree() {
        initFs().then(function () {
            el.rootLabel.textContent = getFs().label;
            return getFs().readDir('');
        }).then(function (entries) {
            S.tree[''] = entries;
            renderTree();
        }).catch(function (err) {
            S.tree[''] = [];
            renderTree();
            el.rootLabel.textContent = 'Klasör seçilmedi';
            log('warn', 'Klasör hazır değil: ' + (err && err.message ? err.message : err));
        });
    }

    function loadChildren(path) {
        var fs = getFs();
        return fs.readDir(path).then(function (entries) {
            S.tree[path] = entries;
            S.expanded[path] = true;
            renderTree();
        }).catch(function (err) {
            log('warn', (path || '.') + ' okunamadı: ' + (err && err.message ? err.message : err));
        });
    }

    function matchesFilter(name) {
        if (!S.filter) return true;
        return String(name).toLowerCase().indexOf(S.filter) !== -1;
    }

    function renderTree() {
        if (!el || !el.tree) return;
        var fs = getFs();
        var html = [];
        function dirRow(e, p, depth, isOpen) {
            var pad = depth * 16;
            return '<div class="nc-tree-row" data-path="' + esc(p) + '" data-type="dir" style="padding-left:' + pad + 'px">' +
                '<span class="nc-caret' + (isOpen ? ' open' : '') + '"><svg class="icon" aria-hidden="true"><use href="#i-caret"/></svg></span>' +
                '<span class="nc-icon">' + fileIcon(e.name) + '</span>' +
                '<span class="nc-name">' + esc(e.name) + '</span>' +
                '<button type="button" class="nc-del" data-del-path="' + esc(p) + '" title="Sil">' + ICONS.trash + '</button>' +
                '</div>';
        }
        function fileRow(e, p, depth) {
            var pad = depth * 16 + 18;
            return '<div class="nc-tree-row" data-path="' + esc(p) + '" data-type="file" data-selected="' + (S.selected === p) + '" style="padding-left:' + pad + 'px">' +
                '<span class="nc-icon">' + fileIcon(e.name) + '</span>' +
                '<span class="nc-name">' + esc(e.name) + '</span>' +
                (e.size != null ? '<span class="nc-size">' + fmtSize(e.size) + '</span>' : '') +
                '<button type="button" class="nc-del" data-del-path="' + esc(p) + '" title="Sil">' + ICONS.trash + '</button>' +
                '</div>';
        }
        function walk(dir, depth) {
            var entries = S.tree[dir];
            if (!entries) return false;
            var any = false;
            entries.forEach(function (e) {
                var p = joinPath(dir, e.name);
                if (e.type === 'dir') {
                    var mark = html.length;
                    var recurse = !!S.filter || !!S.expanded[p];
                    var hasChild = recurse ? walk(p, depth + 1) : false;
                    var isOpen = S.filter ? true : !!S.expanded[p];
                    if (!S.filter || matchesFilter(e.name) || hasChild) {
                        html.splice(mark, 0, dirRow(e, p, depth, isOpen));
                        any = true;
                    }
                } else {
                    if (S.filter && !matchesFilter(e.name)) return;
                    html.push(fileRow(e, p, depth));
                    any = true;
                }
            });
            return any;
        }
        walk('', 0);
        if (!html.length) {
            html.push(S.filter
                ? '<div class="nc-tree-empty">“' + esc(S.filter) + '” ile eşleşen bir şey yok.</div>'
                : '<div class="nc-tree-empty">Klasör boş veya seçilmedi.<br>“Klasör” düğmesiyle bir proje seç.</div>');
        }
        el.tree.innerHTML = html.join('');
        // fs referansı kapanışta sabitlensin (web/electron farkı)
        var fsRef = fs;
        el.tree.onclick = function (ev) {
            var del = ev.target.closest('[data-del-path]');
            if (del) {
                ev.stopPropagation();
                deleteEntry(del.getAttribute('data-del-path'), fsRef);
                return;
            }
            var row = ev.target.closest('.nc-tree-row');
            if (!row) return;
            var p = row.getAttribute('data-path');
            var type = row.getAttribute('data-type');
            if (type === 'dir') {
                if (S.filter) return; // arama modunda ağaç salt okunur listelenir
                if (S.expanded[p]) {
                    S.expanded[p] = false;
                    renderTree();
                } else {
                    loadChildren(p);
                }
            } else {
                S.selected = p;
                renderTree();
            }
        };
    }

    function deleteEntry(p, fsRef) {
        var fs = fsRef || getFs();
        if (!checkPerm({ op: 'delete' }).ok) {
            addSystemMessage(ICONS.alert + ' Silme izni kapalı — İzinler panelinden açabilirsin.');
            return;
        }
        if (window.confirm('Silinsin mi? ' + p)) {
            fs.remove(p).then(function () {
                log('delete', p);
                var parent = parentPath(p);
                delete S.tree[parent];
                delete S.expanded[parent];
                delete S.tree[p];
                delete S.expanded[p];
                if (S.selected === p) S.selected = null;
                refreshTree();
            }).catch(function (err) {
                log('warn', 'Silinemedi: ' + (err && err.message ? err.message : err));
            });
        }
    }

    function newFileFlow() {
        var name = window.prompt('Yeni dosya adı (klasör yolu olabilir, örn. js/sayfa.js):', '');
        if (name == null) return;
        name = String(name).trim().replace(/^\/+/, '');
        if (!name) return;
        if (!/\.[^./\\]+$/.test(baseName(name))) {
            addSystemMessage(ICONS.alert + ' Geçersiz dosya adı: ' + esc(name));
            return;
        }
        if (!checkPerm({ op: 'mkdir' }).ok) {
            addSystemMessage(ICONS.alert + ' Oluşturma izni kapalı — İzinler panelinden açabilirsin.');
            return;
        }
        var fs = getFs();
        initFs().then(function () {
            return fs.writeFile(name, '');
        }).then(function () {
            var dir = parentPath(name);
            if (dir) {
                S.expanded[dir] = true;
                loadChildren(dir);
            }
            log('write', name);
            addSystemMessage(ICONS.check + ' Oluşturuldu: ' + esc(name));
            refreshTree();
        }).catch(function (err) {
            addSystemMessage(ICONS.alert + ' Oluşturulamadı: ' + esc(err && err.message ? err.message : err));
        });
    }

    function renderMessages() {
        if (!el || !el.messages) return;
        var html = [];
        S.messages.forEach(function (m) {
            if (m.role === 'assistant') {
                html.push('<div class="nc-msg nc-msg-assistant">' + mdLite(m.text) + '</div>');
            } else if (m.role === 'user') {
                html.push('<div class="nc-msg nc-msg-user">' + esc(m.text).replace(/\n/g, '<br>') + '</div>');
            } else if (m.role === 'system') {
                html.push('<div class="nc-msg nc-msg-system">' + m.text + '</div>');
            }
        });
        if (S.busy) {
            html.push('<div class="nc-typing"><span></span><span></span><span></span><em>' + esc(S.agentState || 'Çalışıyor…') + '</em></div>');
        }
        var welcome = el.messages.querySelector('.nc-welcome');
        if (html.length && welcome) welcome.remove();
        var existing = el.messages.querySelectorAll('.nc-msg, .nc-typing');
        // Basit yaklaşım: tümünü yeniden bas (mesaj sayısı düşük tutulur)
        existing.forEach(function (n) { n.remove(); });
        el.messages.insertAdjacentHTML('beforeend', html.join(''));
        el.messages.scrollTop = el.messages.scrollHeight;
    }

    var LOG_ICON = {};
    function renderLog() {
        if (!el || !el.log) return;
        LOG_ICON = { list: ICONS.folder, read: ICONS.file, write: ICONS.edit, patch: ICONS.edit, mkdir: ICONS.folder, delete: ICONS.trash, warn: ICONS.alert, info: ICONS.check };
        var html = logEntries.slice(-60).map(function (e) {
            var cls = { list: 'nc-log-list', read: 'nc-log-read', write: 'nc-log-write', patch: 'nc-log-write', mkdir: 'nc-log-list', delete: 'nc-log-delete', warn: 'nc-log-warn' }[e.kind] || '';
            var time = new Date(e.t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
            return '<div class="nc-log-item ' + cls + '"><span class="nc-log-ic">' + (LOG_ICON[e.kind] || '') + '</span><span class="nc-log-time">' + time + '</span><span class="nc-log-text">' + esc(e.text) + '</span></div>';
        }).join('');
        el.log.innerHTML = html || '<div class="nc-log-empty">Henüz işlem yok.</div>';
        el.log.scrollTop = el.log.scrollHeight;
    }

    function renderState() {
        if (!el || !el.root) return;
        el.opCount.textContent = S.opsDone + ' işlem';
        el.root.classList.toggle('nc-busy', !!S.busy);
        el.root.classList.toggle('nc-ultra', S.mode === 'ultra');
        if (el.send) el.send.disabled = !!S.busy;
        if (el.input) el.input.disabled = !!S.busy;
    }

    // ========================================================
    // İzin Dışa Aktarımı — sistem istemi izin durumunu bilir
    // ========================================================
    function permsLine() {
        var on = [], off = [];
        PERM_DEFS.forEach(function (d) {
            (S.permissions[d.key] ? on : off).push(d.label);
        });
        var s = 'İzinler — AÇIK: ' + (on.join(', ') || 'yok') + '; KAPALI: ' + (off.join(', ') || 'yok') + '.';
        if (off.length) s += ' Kapalı işlemleri deneme; gerekiyorsa kullanıcıya İzinler panelinden açmasını söyle.';
        return s;
    }

    // İzin çiplerini (yeniden) bas — panel açık olmasa da içerik güncel kalır
    function renderPerms() {
        if (!el || !el.permList) return;
        el.permList.innerHTML = PERM_DEFS.map(function (d) {
            var on = !!S.permissions[d.key];
            return '<button type="button" class="nc-perm-chip' + (on ? ' on' : '') + '" data-perm="' + d.key + '" title="' + esc(d.hint) + '">' +
                ICONS[d.icon] + '<span>' + esc(d.label) + '</span></button>';
        }).join('');
    }

    // ========================================================
    // Ultra Code — tek tuşla proje iyileştirme
    // ========================================================
    function runUltraCode() {
        if (S.busy) return;
        initFs().then(function () {
            S.messages.push({
                role: 'assistant',
                text: ICONS.zap + ' Ultra Code: projeyi tarıyor, iyileştirmeleri uyguluyorum…',
                t: Date.now()
            });
            renderMessages();
            return agentLoop('Ultra Code modu: projedeki dosyaları incele (list/read), kod kalitesini, hataları ve yapıyı iyileştir (write/patch). Gereksiz dosyaları silme — yalnızca net bir kazanç varsa. Sonunda done ile özet ver.', 'ultra');
        }).catch(function (err) {
            log('warn', 'Ultra Code başlatılamadı: ' + (err && err.message ? err.message : err));
        });
    }

    // ========================================================
    // Olaylar
    // ========================================================
    function autosizeInput() {
        if (!el.input) return;
        el.input.style.height = 'auto';
        el.input.style.height = Math.min(el.input.scrollHeight, 160) + 'px';
    }

    function startTask(text, mode) {
        if (DESKTOP && window.nesilaiCode && typeof window.nesilaiCode.rootInfo === 'function') {
            window.nesilaiCode.rootInfo().then(function (info) {
                if (info && info.connected) { agentLoop(text, mode); return; }
                addSystemMessage(ICONS.alert + ' Önce bir proje klasörü seçilsin.');
                getFs().pickDir().then(function (ok) {
                    if (ok) {
                        S.tree = {};
                        S.expanded = { '': true };
                        refreshTree();
                        agentLoop(text, mode);
                    }
                }).catch(function (err) {
                    log('warn', 'Klasör seçilemedi: ' + (err && err.message ? err.message : err));
                });
            }).catch(function () { agentLoop(text, mode); });
        } else {
            agentLoop(text, mode);
        }
    }

    function bindEvents() {
        $('#nc-close', el.root).addEventListener('click', closeView);
        $('#nc-pick-dir', el.root).addEventListener('click', function () {
            var fs = getFs();
            fs.pickDir().then(function (ok) {
                if (ok) {
                    S.tree = {};
                    S.expanded = { '': true };
                    refreshTree();
                    log('info', 'Klasör seçildi: ' + fs.label);
                }
            }).catch(function (err) {
                log('warn', 'Klasör seçilemedi: ' + (err && err.message ? err.message : err));
            });
        });
        $('#nc-ultra', el.root).addEventListener('click', runUltraCode);
        $('#nc-new-file', el.root).addEventListener('click', newFileFlow);
        if (el.stopBtn) el.stopBtn.addEventListener('click', requestStop);

        el.search.addEventListener('input', function () {
            S.filter = el.search.value.trim().toLowerCase();
            el.searchBox.classList.toggle('has-q', !!S.filter);
            renderTree();
        });
        $('#nc-search-clear', el.root).addEventListener('click', function () {
            el.search.value = '';
            S.filter = '';
            el.searchBox.classList.remove('has-q');
            renderTree();
            el.search.focus();
        });

        renderPerms();
        var permBtn = $('#nc-perms', el.root);
        permBtn.addEventListener('click', function () {
            el.permPanel.classList.toggle('hidden');
            permBtn.classList.toggle('active', !el.permPanel.classList.contains('hidden'));
        });
        el.permList.addEventListener('click', function (ev) {
            var chip = ev.target.closest('[data-perm]');
            if (!chip) return;
            var key = chip.getAttribute('data-perm');
            S.permissions[key] = !S.permissions[key];
            savePerms();
            renderPerms();
            log(S.permissions[key] ? 'info' : 'warn', 'İzin ' + (S.permissions[key] ? 'açıldı' : 'kapatıldı') + ': ' + permLabel(key));
        });

        var form = $('#nc-form', el.root);
        form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var text = (el.input.value || '').trim();
            if (!text || S.busy) return;
            el.input.value = '';
            autosizeInput();
            addUserMessage(text);
            startTask(text, 'idle');
        });

        el.input.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
        });
        el.input.addEventListener('input', autosizeInput);

        document.addEventListener('keydown', ncKeyHandler);
    }

    function ncKeyHandler(ev) {
        if (ev.key !== 'Escape') return;
        if (!S.open) return;
        if (S.busy) { requestStop(); return; }   // önce ajanı durdur
        closeView();
    }

    // ========================================================
    // /nesilcode komut yönlendirmesi — app.js bunu çağırır
    // ========================================================
    function handleCommand(body) {
        var b = String(body || '').trim().toLowerCase();
        if (b === 'on') { openView(); return 'NesilCode açıldı. Görevini yaz, dosyalarını ben yönetirim.'; }
        if (b === 'off') { closeView(); return 'NesilCode kapatıldı.'; }
        toggleView();
        return S.open
            ? 'NesilCode açıldı. Kodlama görevini yaz; dosyaları okuyup yazarım — kodu sohbete dökmem, doğrudan oluştururum.'
            : 'NesilCode kapatıldı.';
    }

    // Kenar çubuğu düğmesi — modül yüklenirken bağlanır (OpenView deseni)
    (function bindSidebarButton() {
        var btn = document.getElementById('open-nesilcode-btn');
        if (btn) btn.addEventListener('click', function (e) {
            e.preventDefault();
            toggleView();
        });
    })();

    // ========================================================
    // Dışa Aktarım
    // ========================================================
    window.NesilCode = {
        open: openView,
        close: closeView,
        toggle: toggleView,
        handleCommand: handleCommand,
        isOpen: function () { return !!S.open; },
        isBusy: function () { return !!S.busy; },
        isDesktopFs: function () { return DESKTOP; },
        // İzinler — dışarıdan okuma/değiştirme (test + ileride ayarlar entegrasyonu)
        getPermissions: function () { return Object.assign({}, S.permissions); },
        setPermission: function (key, on) {
            var found = PERM_DEFS.some(function (d) { return d.key === key; });
            if (!found) return false;
            S.permissions[key] = !!on;
            savePerms();
            renderPerms();
            return true;
        },
        // Hata ayıklama & test kancası
        _test: {
            getFs: getFs,
            agentLoop: agentLoop,
            extractAction: extractAction,
            applyPatch: applyPatch,
            repairJsonCandidate: repairJsonCandidate,
            state: S
        }
    };
})();
