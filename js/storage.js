/* ========================================================
   NesilAI — Kalıcı Depolama (IndexedDB)
   --------------------------------------------------------
   "Localhosta kaydedecek her şeyi": sohbetlerdeki üretilen
   görsel/müzik/video blob'ları ve üretim havuzu çıktıları
   burada saklanır; sayfa yenilense bile geri yüklenir.
   localStorage'a fallback: IDB kapalıysa URL referansı
   (yeniden çekilebilen http URL'ler) yine çalışır.
   ======================================================== */
(function () {
    'use strict';

    const DB_NAME = 'nesilai_media_db';
    const DB_VERSION = 1;
    const STORE_MEDIA = 'media';      // key: id → { id, chatId, msgId, kind, mime, blob, prompt, createdAt }
    const STORE_POOL = 'poolGallery'; // key: id → { id, kind, mime, blob, text, meta, createdAt }

    let dbPromise = null;

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (!('indexedDB' in window)) { reject(new Error('IndexedDB yok')); return; }
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_MEDIA)) {
                    const s = db.createObjectStore(STORE_MEDIA, { keyPath: 'id' });
                    s.createIndex('msgId', 'msgId', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORE_POOL)) {
                    const s = db.createObjectStore(STORE_POOL, { keyPath: 'id' });
                    s.createIndex('kind', 'kind', { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }).catch(err => { dbPromise = null; throw err; });
        return dbPromise;
    }

    function tx(store, mode, fn) {
        return openDb().then(db => new Promise((resolve, reject) => {
            const t = db.transaction(store, mode);
            const s = t.objectStore(store);
            const out = fn(s);
            t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
            t.onerror = () => reject(t.error);
            t.onabort = () => reject(t.error || new Error('İşlem yarıda kesildi'));
        }));
    }

    function put(store, record) { return tx(store, 'readwrite', s => s.put(record)); }
    function get(store, id) {
        return openDb().then(db => new Promise((resolve, reject) => {
            const req = db.transaction(store, 'readonly').objectStore(store).get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        }));
    }
    function getAll(store) {
        return openDb().then(db => new Promise((resolve, reject) => {
            const req = db.transaction(store, 'readonly').objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        }));
    }
    function del(store, id) { return tx(store, 'readwrite', s => s.delete(id)); }

    // ========================================================
    // Sohbet medyası: mesaj başına tek kayıt (id = msgId)
    // ========================================================

    /** URL (blob: veya http) → Blob. http URL'lerde CORS iznine güven; hata olursa null. */
    async function urlToBlob(url) {
        try {
            const res = await fetch(url, { mode: 'cors' });
            if (!res.ok) return null;
            return await res.blob();
        } catch (e) { return null; }
    }

    /**
     * Sohbet mesajının medyasını kalıcı kaydet.
     * kind: 'image' | 'music' | 'video'
     * Döndürür: kaydedildi=true (kalıcı blob) / false (referans modunda)
     */
    async function saveMessageMedia(msgId, kind, url, prompt) {
        if (!msgId || !url) return false;
        if (url.startsWith('blob:')) {
            const blob = await urlToBlob(url);
            if (!blob) return false;
            await put(STORE_MEDIA, { id: msgId, kind, blob, prompt: prompt || '', createdAt: Date.now() });
            return true;
        }
        // http(s) URL: yeniden çekilebilir; blob alınırsa tam kalıcı olur
        const blob = await urlToBlob(url);
        if (blob) {
            await put(STORE_MEDIA, { id: msgId, kind, blob, prompt: prompt || '', createdAt: Date.now() });
            return true;
        }
        return false;
    }

    /** Mesajın kalıcı medyasını object URL olarak geri verir. */
    async function loadMessageMedia(msgId) {
        const rec = await get(STORE_MEDIA, msgId).catch(() => null);
        if (!rec) return null;
        return { kind: rec.kind, url: URL.createObjectURL(rec.blob), prompt: rec.prompt };
    }

    async function deleteMessageMedia(msgId) {
        await del(STORE_MEDIA, msgId).catch(() => {});
    }

    // ========================================================
    // Üretim havuzu galerisi: tüm çıktılar kalıcı
    // ========================================================

    async function addPoolItem(kind, data) {
        // kind: 'image' | 'tts' | 'stt' | 'ocr' | 'music' | 'video'
        const rec = {
            id: 'pool_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
            kind,
            createdAt: Date.now()
        };
        if (data.blob) rec.blob = data.blob;
        if (data.url && !data.blob) {
            const blob = await urlToBlob(data.url);
            if (blob) rec.blob = blob;
        }
        rec.text = data.text || '';
        rec.meta = data.meta || '';
        await put(STORE_POOL, rec);
        return rec;
    }

    async function getPoolItems(kind) {
        const all = await getAll(STORE_POOL).catch(() => []);
        const list = kind ? all.filter(r => r.kind === kind) : all;
        return list.sort((a, b) => b.createdAt - a.createdAt).map(r => ({
            id: r.id, kind: r.kind, text: r.text, meta: r.meta, createdAt: r.createdAt,
            url: r.blob ? URL.createObjectURL(r.blob) : null
        }));
    }

    async function deletePoolItem(id) {
        await del(STORE_POOL, id).catch(() => {});
    }

    async function clearPoolKind(kind) {
        const all = await getAll(STORE_POOL).catch(() => []);
        await Promise.all(all.filter(r => r.kind === kind).map(r => del(STORE_POOL, r.id)));
    }

    window.NesilStore = {
        saveMessageMedia,
        loadMessageMedia,
        deleteMessageMedia,
        addPoolItem,
        getPoolItems,
        deletePoolItem,
        clearPoolKind,
        urlToBlob
    };

})();
