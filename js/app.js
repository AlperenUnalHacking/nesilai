/* ========================================================
   NesilAI — Ana Uygulama, Abonelik & Yapay Zeka Motoru
   ChatGPT & Gemini Tarzı Birleşik Arayüz
   ======================================================== */
(function () {
    'use strict';

    // ========================================================
    // Abonelik Planları & Limit Tanımları
    // ========================================================
    const PLANS = {
        free: {
            id: 'free',
            name: 'Free (Ücretsiz)',
            badge: 'Free Plan',
            price: '0₺',
            limits: {
                images: 5,
                chats: 50,
                stt: 50,
                tts: 25
            }
        },
        premium: {
            id: 'premium',
            name: 'Premium',
            badge: 'Premium ⭐',
            price: '49₺/ay',
            limits: {
                images: 10,  // 5 * 2
                chats: 100,  // 50 * 2
                stt: 100,    // 50 * 2
                tts: 50      // 25 * 2
            }
        },
        premium_go: {
            id: 'premium_go',
            name: 'Premium Go',
            badge: 'Premium Go 🚀',
            price: '89₺/ay',
            limits: {
                images: 20,  // 10 * 2
                chats: 200,  // 100 * 2
                stt: 200,    // 100 * 2
                tts: 100     // 50 * 2
            }
        },
        premium_plus: {
            id: 'premium_plus',
            name: 'Premium Plus',
            badge: 'Premium Plus 👑',
            price: '149₺/ay',
            limits: {
                images: 40,  // 20 * 2
                chats: 400,  // 200 * 2
                stt: 400,    // 200 * 2
                tts: 200     // 100 * 2
            }
        },
        unlimited: {
            id: 'unlimited',
            name: 'Sınırsız (Unlimited)',
            badge: '♾️ Sınırsız',
            price: '—',
            limits: {
                images: Infinity,
                chats: Infinity,
                stt: Infinity,
                tts: Infinity
            }
        }
    };

    // Abonelik Durumu
    let currentSubscription = {
        plan: 'free',
        usage: {
            images: 0,
            chats: 0,
            stt: 0,
            tts: 0
        }
    };

    // ========================================================
    // DOM Elementleri
    // ========================================================
    // Kenar Çubuğu
    const sidebar = document.getElementById('sidebar');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const chatHistoryList = document.getElementById('chat-history-list');
    const openVoiceModeBtn = document.getElementById('open-voice-mode-btn');
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const openSubscriptionBtn = document.getElementById('open-subscription-btn');
    const sidebarPlanBadge = document.getElementById('sidebar-plan-badge');
    const widgetPlanName = document.getElementById('widget-plan-name');
    const sidebarUpgradeBtn = document.getElementById('sidebar-upgrade-btn');
    const miniBarImages = document.getElementById('mini-bar-images');
    const miniBarChats = document.getElementById('mini-bar-chats');
    const miniTxtImages = document.getElementById('mini-txt-images');
    const miniTxtChats = document.getElementById('mini-txt-chats');

    // Üst Çubuk
    const currentChatTitle = document.getElementById('current-chat-title');
    const headerVoiceBtn = document.getElementById('header-voice-btn');
    const headerSettingsBtn = document.getElementById('header-settings-btn');
    const headerSubBtn = document.getElementById('header-sub-btn');
    const headerPlanName = document.getElementById('header-plan-name');
    const themeToggleBtn = document.getElementById('theme-toggle');

    // Sohbet Alanı
    const chatMessages = document.getElementById('chat-messages');
    const welcomeHero = document.getElementById('welcome-hero');
    const suggestionCards = document.querySelectorAll('.suggestion-card');

    // Alt Mesaj Kutusu
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const micBtn = document.getElementById('mic-btn');
    const attachBtn = document.getElementById('attach-btn');
    const fileInput = document.getElementById('file-input');
    const attachmentPreviewBar = document.getElementById('attachment-preview-bar');
    const attachmentThumbnail = document.getElementById('attachment-thumbnail');
    const attachmentFilename = document.getElementById('attachment-filename');
    const attachmentStatus = document.getElementById('attachment-status');
    const removeAttachmentBtn = document.getElementById('remove-attachment-btn');

    // Abonelik Modalı
    const subscriptionModal = document.getElementById('subscription-modal');
    const subscriptionBackdrop = document.getElementById('subscription-backdrop');
    const closeSubModalBtn = document.getElementById('close-sub-modal-btn');
    const dashActivePlan = document.getElementById('dash-active-plan');
    const statValImages = document.getElementById('stat-val-images');
    const statBarImages = document.getElementById('stat-bar-images');
    const statValChats = document.getElementById('stat-val-chats');
    const statBarChats = document.getElementById('stat-bar-chats');
    const statValStt = document.getElementById('stat-val-stt');
    const statBarStt = document.getElementById('stat-bar-stt');
    const statValTts = document.getElementById('stat-val-tts');
    const statBarTts = document.getElementById('stat-bar-tts');
    const planCards = document.querySelectorAll('.pricing-card');
    const selectPlanBtns = document.querySelectorAll('.btn-select-plan');
    const resetUsageBtn = document.getElementById('reset-usage-btn');

    // Kupon Modalı
    const couponModal = document.getElementById('coupon-modal');
    const couponBackdrop = document.getElementById('coupon-backdrop');
    const closeCouponModalBtn = document.getElementById('close-coupon-modal-btn');
    const couponFormView = document.getElementById('coupon-form-view');
    const couponSuccessView = document.getElementById('coupon-success-view');
    const couponPlanSelect = document.getElementById('coupon-plan-select');
    const couponCodeInput = document.getElementById('coupon-code-input');
    const couponActivateBtn = document.getElementById('coupon-activate-btn');
    const couponError = document.getElementById('coupon-error');
    const couponSuccessText = document.getElementById('coupon-success-text');
    const subCouponStatus = document.getElementById('sub-coupon-status');
    const openCouponModalBtn = document.getElementById('open-coupon-modal-btn');
    const couponDoneBtn = document.getElementById('coupon-done-btn');

    // Üretim Havuzu
    const poolModal = document.getElementById('pool-modal');
    const poolBackdrop = document.getElementById('pool-backdrop');
    const closePoolModalBtn = document.getElementById('close-pool-modal-btn');
    const openPoolBtn = document.getElementById('open-pool-btn');
    const poolTabs = document.querySelectorAll('.pool-tab');
    const poolPanes = document.querySelectorAll('.pool-pane');
    const poolImagePrompt = document.getElementById('pool-image-prompt');
    const poolImageSize = document.getElementById('pool-image-size');
    const poolImageCount = document.getElementById('pool-image-count');
    const poolImageBtn = document.getElementById('pool-image-btn');
    const poolImageStatus = document.getElementById('pool-image-status');
    const poolImageResults = document.getElementById('pool-image-results');
    const poolTtsText = document.getElementById('pool-tts-text');
    const poolTtsVoice = document.getElementById('pool-tts-voice');
    const poolTtsSpeed = document.getElementById('pool-tts-speed');
    const poolTtsSpeedVal = document.getElementById('pool-tts-speed-val');
    const poolTtsBtn = document.getElementById('pool-tts-btn');
    const poolTtsStatus = document.getElementById('pool-tts-status');
    const poolTtsHistory = document.getElementById('pool-tts-history');
    const poolSttBtn = document.getElementById('pool-stt-btn');
    const poolSttStatus = document.getElementById('pool-stt-status');
    const poolSttText = document.getElementById('pool-stt-text');
    const poolSttCopy = document.getElementById('pool-stt-copy');
    const poolSttDownload = document.getElementById('pool-stt-download');
    const poolSttClear = document.getElementById('pool-stt-clear');
    const poolOcrDrop = document.getElementById('pool-ocr-drop');
    const poolOcrFile = document.getElementById('pool-ocr-file');
    const poolOcrPick = document.getElementById('pool-ocr-pick');
    const poolOcrStatus = document.getElementById('pool-ocr-status');
    const poolOcrText = document.getElementById('pool-ocr-text');
    const poolOcrCopy = document.getElementById('pool-ocr-copy');
    const poolOcrDownload = document.getElementById('pool-ocr-download');

    // Composer Model Seçici
    const modelPickerWrap = document.getElementById('model-picker-wrap');
    const modelPickerBtn = document.getElementById('model-picker-btn');
    const modelPickerLabel = document.getElementById('model-picker-label');
    const modelMenu = document.getElementById('model-picker-menu');
    const modelPickerSearch = document.getElementById('model-picker-search');

    // Sesli Sohbet Modalı (Voice Mode)
    const voiceModal = document.getElementById('voice-modal');
    const closeVoiceModalBtn = document.getElementById('close-voice-modal-btn');
    const voiceOrb = document.getElementById('voice-orb');
    const voiceStatusText = document.getElementById('voice-status-text');
    const voiceLiveTranscript = document.getElementById('voice-live-transcript');
    const voiceMuteBtn = document.getElementById('voice-mute-btn');
    const voiceEndBtn = document.getElementById('voice-end-btn');

    // Ayarlar Modalı — Ses
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingVoiceSelect = document.getElementById('setting-voice-select');
    const settingVoiceSpeed = document.getElementById('setting-voice-speed');
    const settingVoicePitch = document.getElementById('setting-voice-pitch');
    const settingAutoSpeak = document.getElementById('setting-auto-speak');
    const clearAllChatsBtn = document.getElementById('clear-all-chats-btn');

    // Ayarlar Modalı — Yapay Zeka Sağlayıcı
    const aiProviderSelect = document.getElementById('ai-provider-select');
    const aiProviderNote = document.getElementById('ai-provider-note');
    const aiModelInput = document.getElementById('ai-model-input');
    const aiModelList = document.getElementById('ai-model-list');
    const aiKeyField = document.getElementById('ai-key-field');
    const aiKeyInput = document.getElementById('ai-key-input');
    const aiKeyToggle = document.getElementById('ai-key-toggle');
    const aiKeyLink = document.getElementById('ai-key-link');
    const aiBaseUrlField = document.getElementById('ai-baseurl-field');
    const aiBaseUrlInput = document.getElementById('ai-baseurl-input');
    const aiTemperature = document.getElementById('ai-temperature');
    const aiTempVal = document.getElementById('ai-temp-val');
    const aiTestBtn = document.getElementById('ai-test-btn');
    const aiTestResult = document.getElementById('ai-test-result');
    const aiStatusChip = document.getElementById('ai-status-chip');
    const aiStatusText = document.getElementById('ai-status-text');
    const welcomeProvider = document.getElementById('welcome-provider');
    const welcomeSetupBtn = document.getElementById('welcome-setup-btn');

    const AI = window.NesilAI;

    // ========================================================
    // Uygulama Durumu (State)
    // ========================================================
    let chats = [];
    let currentChatId = null;
    let activeAttachment = null;
    let isVoiceModeActive = false;
    let currentlySpeakingBtn = null;

    const THEME_KEY = 'nesilai_theme';

    // ========================================================
    // Başlangıç (Initialization)
    // ========================================================
    function initApp() {
        // Tema: kaydedilmiş tercih yoksa sistem tercihi kullanılır
        applyTheme(localStorage.getItem(THEME_KEY) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

        // Ses ayarlarını başlat
        if (window.NesilTTS) {
            window.NesilTTS.initVoiceSettings(settingVoiceSelect, settingVoiceSpeed, settingVoicePitch);
        }

        // Aboneliği yükle
        loadSubscription();

        // Ayarları yükle
        loadSettings();

        // Sohbetleri yükle
        loadChatsFromStorage();

        // Event listener'ları bağla
        bindEvents();

        // Giriş kutusu boyutlandırma
        autoResizeTextarea();
    }

    // ========================================================
    // Abonelik Sistemi & Limit Kontrolü
    // ========================================================
    function loadSubscription() {
        try {
            const saved = localStorage.getItem('nesilai_sub_v2');
            if (saved) {
                const parsed = JSON.parse(saved);
                currentSubscription = {
                    plan: parsed.plan || 'free',
                    usage: Object.assign({ images: 0, chats: 0, stt: 0, tts: 0 }, parsed.usage),
                    coupon: parsed.coupon || null,
                    couponPlan: parsed.couponPlan || null,
                    couponUntil: parsed.couponUntil || null
                };
            }
        } catch (e) {
            currentSubscription = {
                plan: 'free',
                usage: { images: 0, chats: 0, stt: 0, tts: 0 }
            };
        }

        // Kupon süresi dolmuşsa ücretsiz plana geri dön
        if (currentSubscription.couponUntil && Date.now() > currentSubscription.couponUntil) {
            currentSubscription.plan = 'free';
            currentSubscription.coupon = null;
            currentSubscription.couponPlan = null;
            currentSubscription.couponUntil = null;
            localStorage.setItem('nesilai_sub_v2', JSON.stringify(currentSubscription));
        }

        updateSubscriptionUI();
    }

    function saveSubscription() {
        localStorage.setItem('nesilai_sub_v2', JSON.stringify(currentSubscription));
        updateSubscriptionUI();
    }

    function getPlan() {
        return PLANS[currentSubscription.plan] || PLANS.free;
    }

    function checkQuota(type) {
        const plan = getPlan();
        const current = currentSubscription.usage[type] || 0;
        const limit = plan.limits[type];

        if (limit === Infinity) return true;

        if (current >= limit) {
            const typeLabels = {
                images: 'Görsel oluşturma',
                chats: 'Sohbet mesajı',
                stt: 'Sesi yazıya çevirme (Mikrofon)',
                tts: 'Yazıyı sese çevirme (Dinleme)'
            };
            const label = typeLabels[type] || type;
            showToast(`⚠️ ${label} limitinize ulaştınız (${current}/${limit})!`, 'warning');
            openSubscriptionModal();
            return false;
        }
        return true;
    }

    function incrementQuota(type) {
        if (currentSubscription.usage[type] !== undefined) {
            currentSubscription.usage[type]++;
            saveSubscription();
        }
    }

    function updateSubscriptionUI() {
        const plan = getPlan();
        const usage = currentSubscription.usage;

        // Rozetler
        if (sidebarPlanBadge) sidebarPlanBadge.textContent = plan.badge;
        if (headerPlanName) headerPlanName.textContent = plan.badge;
        if (widgetPlanName) widgetPlanName.textContent = plan.name;
        if (dashActivePlan) dashActivePlan.textContent = plan.name;

        // Kenar Çubuğu Mini Barlar
        const paintMeter = (txtEl, barEl, used, limit) => {
            if (txtEl) txtEl.textContent = limit === Infinity ? `${used} / ∞` : `${used}/${limit}`;
            if (barEl) barEl.style.width = (limit === Infinity ? 0 : Math.min(100, (used / limit) * 100)) + '%';
        };
        paintMeter(miniTxtImages, miniBarImages, usage.images, plan.limits.images);
        paintMeter(miniTxtChats, miniBarChats, usage.chats, plan.limits.chats);

        // Modal İstatistikleri
        const paintStat = (valEl, barEl, used, limit) => {
            if (valEl) valEl.textContent = limit === Infinity ? `${used} / ∞` : `${used} / ${limit}`;
            if (barEl) barEl.style.width = (limit === Infinity ? 0 : Math.min(100, (used / limit) * 100)) + '%';
        };
        paintStat(statValImages, statBarImages, usage.images, plan.limits.images);
        paintStat(statValChats, statBarChats, usage.chats, plan.limits.chats);
        paintStat(statValStt, statBarStt, usage.stt, plan.limits.stt);
        paintStat(statValTts, statBarTts, usage.tts, plan.limits.tts);

        // Kupon durumu satırı
        if (subCouponStatus) {
            if (currentSubscription.couponUntil && Date.now() < currentSubscription.couponUntil) {
                const end = new Date(currentSubscription.couponUntil);
                const days = Math.ceil((currentSubscription.couponUntil - Date.now()) / 86400000);
                subCouponStatus.textContent = `🎟️ Kupon "${currentSubscription.coupon}" aktif — ${end.toLocaleDateString('tr-TR')} tarihine kadar (${days} gün) sınırsız erişim.`;
                subCouponStatus.classList.remove('hidden');
            } else {
                subCouponStatus.classList.add('hidden');
            }
        }

        // Plan Kartları Aktiflik İşareti
        planCards.forEach(card => {
            const tier = card.dataset.plan;
            const btn = card.querySelector('.btn-select-plan');
            if (tier === currentSubscription.plan) {
                card.classList.add('active-plan');
                if (btn) {
                    btn.textContent = '✅ Aktif Plan';
                    btn.disabled = true;
                    btn.classList.remove('btn-primary', 'btn-glow');
                }
            } else {
                card.classList.remove('active-plan');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = tier === 'unlimited' ? '♾️ Sınırsız\'a geç' : `${PLANS[tier].name}'a Geç`;
                    if (tier !== 'free') btn.classList.add('btn-primary');
                    if (tier === 'premium_plus' || tier === 'unlimited') btn.classList.add('btn-glow');
                }
            }
        });
    }

    function switchPlan(newPlanId) {
        if (!PLANS[newPlanId]) return;
        currentSubscription.plan = newPlanId;
        saveSubscription();
        showToast(`🎉 Tebrikler! ${PLANS[newPlanId].name} paketine geçtiniz!`);
    }

    // ========================================================
    // Kupon ile Abonelik Aktifleştirme
    //   Kodlar: 1, 2, 3 → seçilen planı 18 ay boyunca ücretsiz açar.
    // ========================================================
    const COUPON_CODES = { '1': true, '2': true, '3': true };
    const COUPON_DURATION_MS = 18 * 30 * 24 * 60 * 60 * 1000; // 18 ay

    function activateCoupon(rawCode, planId) {
        const code = (rawCode || '').trim();
        if (!COUPON_CODES[code]) {
            return { ok: false, message: 'Geçersiz kupon kodu. Kod tek haneli: 1, 2 veya 3.' };
        }
        if (!PLANS[planId] || planId === 'free') {
            return { ok: false, message: 'Aktifleştirmek için listeden bir plan seç.' };
        }

        currentSubscription.plan = planId;
        currentSubscription.coupon = code;
        currentSubscription.couponPlan = planId;
        currentSubscription.couponUntil = Date.now() + COUPON_DURATION_MS;
        saveSubscription();

        return { ok: true, planId: planId, until: currentSubscription.couponUntil };
    }

    function openCouponModal() {
        if (subscriptionModal) subscriptionModal.classList.add('hidden');
        couponModal.classList.remove('hidden');
        couponFormView.classList.remove('hidden');
        couponSuccessView.classList.add('hidden');
        couponError.classList.add('hidden');
        if (couponCodeInput) couponCodeInput.value = '';
        closeMobileSidebar();
    }

    function closeCouponModal() {
        couponModal.classList.add('hidden');
        updateSubscriptionUI();
    }

    function handleCouponActivation() {
        const planId = couponPlanSelect ? couponPlanSelect.value : '';
        const code = couponCodeInput ? couponCodeInput.value : '';

        const result = activateCoupon(code, planId);

        if (!result.ok) {
            couponError.textContent = '⚠️ ' + result.message;
            couponError.classList.remove('hidden');
            return;
        }

        couponError.classList.add('hidden');
        couponFormView.classList.add('hidden');
        couponSuccessView.classList.remove('hidden');

        const end = new Date(result.until);
        couponSuccessText.textContent =
            `🎟️ ${PLANS[result.planId].name} planı ${end.toLocaleDateString('tr-TR')} tarihine kadar (18 ay) ` +
            'ücretsiz aktifleştirildi. Tüm limitler kaldırıldı — sınırsız sohbet, görsel ve seslendirme.';
        updateAiStatusChip();
        showToast('Abonelik aktifleştirildi 🎉', 'success');
    }

    // ========================================================
    // Üretim Havuzu — sohbetten bağımsız üretim atölyesi
    //   Görsel üretimi, yazıdan sese, sesten yazıya, görselden metin.
    //   Kota olarak yalnızca ilgili kaynakları sayar (görsel/tts/stt).
    // ========================================================
    function openPoolModal() {
        poolModal.classList.remove('hidden');
        closeMobileSidebar();
        populatePoolVoices();
    }

    function closePoolModal() {
        poolModal.classList.add('hidden');
        if (window.NesilSTT && window.NesilSTT.isListening()) {
            window.NesilSTT.stop();
            poolSttBtn.classList.remove('listening');
            setPoolSttStatus('Kayıt durduruldu.');
        }
        if (window.NesilTTS) window.NesilTTS.stop();
    }

    function setPoolSttStatus(text) {
        if (poolSttStatus) poolSttStatus.textContent = text;
    }

    function activatePoolTab(name) {
        poolTabs.forEach(t => t.classList.toggle('active', t.dataset.poolTab === name));
        poolPanes.forEach(p => {
            const active = p.dataset.poolPane === name;
            p.classList.toggle('active', active);
            p.hidden = !active;
        });
    }

    function populatePoolVoices() {
        if (!poolTtsVoice || !window.NesilTTS) return;
        const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
        if (!voices.length) return;

        const savedName = poolTtsVoice.dataset.savedName || localStorage.getItem('nesilai_voice_name') || '';
        const sorted = [...voices].sort((a, b) => {
            const aTr = a.lang.toLowerCase().startsWith('tr');
            const bTr = b.lang.toLowerCase().startsWith('tr');
            if (aTr && !bTr) return -1;
            if (!aTr && bTr) return 1;
            if (a.localService !== b.localService) return a.localService ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        poolTtsVoice.innerHTML = '';
        sorted.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.name;
            const isTr = v.lang.toLowerCase().startsWith('tr');
            opt.textContent = `${isTr ? '🇹🇷 ' : ''}${v.name} (${v.lang})${v.localService ? '' : ' [çevrimiçi]'}`;
            if (v.name === savedName) opt.selected = true;
            poolTtsVoice.appendChild(opt);
        });
        poolTtsVoice.dataset.savedName = poolTtsVoice.value;
    }

    function poolDownloadText(text, prefix) {
        const blob = new Blob([text || ''], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${prefix}-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function initPool() {
        if (!poolModal) return;

        if (openPoolBtn) openPoolBtn.addEventListener('click', openPoolModal);
        if (closePoolModalBtn) closePoolModalBtn.addEventListener('click', closePoolModal);
        if (poolBackdrop) poolBackdrop.addEventListener('click', closePoolModal);

        poolTabs.forEach(tab => {
            tab.addEventListener('click', () => activatePoolTab(tab.dataset.poolTab));
        });

        // --- Görsel üretimi ---
        if (poolImageBtn) {
            poolImageBtn.addEventListener('click', async () => {
                const prompt = (poolImagePrompt.value || '').trim();
                if (!prompt) {
                    poolImageStatus.textContent = 'Önce ne çizileceğini yaz.';
                    return;
                }
                const count = parseInt(poolImageCount.value, 10) || 1;
                if (!checkQuota('images')) return;

                incrementQuota('images');
                const [w, h] = (poolImageSize.value || '1024x768').split('x').map(n => parseInt(n, 10));

                poolImageBtn.disabled = true;
                poolImageStatus.textContent = `${count} görsel üretiliyor…`;
                poolImageResults.innerHTML = '';

                for (let i = 0; i < count; i++) {
                    const url = window.NesilT2P.generateImageUrl(prompt, w, h);
                    const cell = document.createElement('div');
                    cell.className = 'pool-image-cell';
                    const skeleton = document.createElement('div');
                    skeleton.className = 'pool-image-skeleton';
                    skeleton.textContent = 'Üretiliyor…';
                    cell.appendChild(skeleton);

                    const img = document.createElement('img');
                    img.alt = prompt;
                    img.style.display = 'none';
                    img.onload = () => {
                        skeleton.remove();
                        img.style.display = 'block';
                        const dl = document.createElement('button');
                        dl.className = 'btn btn-outline btn-mini pool-dl';
                        dl.textContent = 'İndir';
                        dl.addEventListener('click', async () => {
                            try {
                                const res = await fetch(url);
                                const blob = await res.blob();
                                const objUrl = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = objUrl;
                                a.download = `nesilai-pool-${Date.now()}.jpg`;
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                                URL.revokeObjectURL(objUrl);
                            } catch (e) {
                                window.open(url, '_blank');
                            }
                        });
                        cell.appendChild(dl);
                    };
                    img.onerror = () => {
                        skeleton.textContent = 'Üretilemedi, tekrar dene.';
                    };
                    img.src = url;
                    cell.appendChild(img);
                    poolImageResults.appendChild(cell);
                }

                poolImageBtn.disabled = false;
                poolImageStatus.textContent = `Havuza eklendi: ${count} görsel üretildi.`;
                showToast('Üretim havuzu: görseller hazır 🎨', 'success');
            });
        }

        // --- Yazıdan sese ---
        if (poolTtsSpeed) {
            poolTtsSpeed.addEventListener('input', () => {
                if (poolTtsSpeedVal) poolTtsSpeedVal.textContent = parseFloat(poolTtsSpeed.value).toFixed(1);
            });
        }
        if (poolTtsVoice) {
            poolTtsVoice.addEventListener('change', () => {
                poolTtsVoice.dataset.savedName = poolTtsVoice.value;
                localStorage.setItem('nesilai_voice_name', poolTtsVoice.value);
            });
        }
        if (poolTtsBtn) {
            poolTtsBtn.addEventListener('click', () => {
                const text = (poolTtsText.value || '').trim();
                if (!text) {
                    poolTtsStatus.textContent = 'Önce seslendirilecek metni yaz.';
                    return;
                }
                if (!window.NesilTTS || !window.NesilTTS.isSupported()) {
                    poolTtsStatus.textContent = 'Bu tarayıcı seslendirmeyi desteklemiyor.';
                    return;
                }
                if (!checkQuota('tts')) return;

                incrementQuota('tts');
                const voiceName = poolTtsVoice ? poolTtsVoice.value : '';
                const rate = poolTtsSpeed ? parseFloat(poolTtsSpeed.value) || 1.0 : 1.0;

                poolTtsBtn.disabled = true;
                poolTtsStatus.textContent = 'Seslendiriliyor…';

                window.NesilTTS.speak(text,
                    () => {
                        poolTtsBtn.disabled = false;
                        poolTtsStatus.textContent = 'Okunuyor… (bitince kayıt altına eklenir)';
                    },
                    () => {
                        poolTtsStatus.textContent = 'Tamamlandı.';
                        addPoolTtsHistory(text, voiceName, rate);
                        poolTtsBtn.disabled = false;
                    },
                    () => {
                        poolTtsStatus.textContent = 'Seslendirme başlatılamadı.';
                        poolTtsBtn.disabled = false;
                    }
                );
            });
        }

        function addPoolTtsHistory(text, voiceName, rate) {
            const item = document.createElement('div');
            item.className = 'pool-tts-item';
            const meta = document.createElement('span');
            meta.className = 'pool-tts-meta';
            meta.textContent = `${voiceName || 'Sistem sesi'} · ${rate.toFixed(1)}x · ${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`;
            const play = document.createElement('button');
            play.className = 'btn btn-mini btn-outline';
            play.textContent = 'Tekrar oynat';
            play.addEventListener('click', () => {
                if (window.NesilTTS) window.NesilTTS.speak(text);
            });
            item.appendChild(meta);
            item.appendChild(play);
            poolTtsHistory.insertBefore(item, poolTtsHistory.firstChild);
        }

        // --- Sesten yazıya ---
        if (poolSttBtn) {
            poolSttBtn.addEventListener('click', () => {
                if (!window.NesilSTT || !window.NesilSTT.isSupported()) {
                    setPoolSttStatus('Bu tarayıcı konuşma tanımayı desteklemiyor.');
                    return;
                }
                if (window.NesilSTT.isListening()) {
                    window.NesilSTT.stop();
                    poolSttBtn.classList.remove('listening');
                    setPoolSttStatus('Kayıt durduruldu.');
                    return;
                }
                if (!checkQuota('stt')) return;

                window.NesilSTT.start({
                    onStart: () => {
                        incrementQuota('stt');
                        poolSttBtn.classList.add('listening');
                        setPoolSttStatus('Dinliyorum… konuşmaya başlayabilirsin.');
                    },
                    onInterim: (interim) => {
                        setPoolSttStatus(`“${interim}…”`);
                    },
                    onFinal: (final) => {
                        poolSttText.value = (poolSttText.value ? poolSttText.value + ' ' : '') + final;
                    },
                    onEnd: () => {
                        poolSttBtn.classList.remove('listening');
                        setPoolSttStatus('Kayıt bitti. Metni düzenleyip kopyalayabilir/indirebilirsin.');
                    },
                    onError: (err) => {
                        poolSttBtn.classList.remove('listening');
                        setPoolSttStatus('Mikrofon hatası: ' + (err.error || 'bilinmiyor'));
                    }
                });
            });
        }
        if (poolSttCopy) poolSttCopy.addEventListener('click', () => {
            if (poolSttText.value.trim()) copyTextToClipboard(poolSttText.value.trim());
        });
        if (poolSttDownload) poolSttDownload.addEventListener('click', () => {
            if (poolSttText.value.trim()) poolDownloadText(poolSttText.value.trim(), 'nesilai-konusma');
        });
        if (poolSttClear) poolSttClear.addEventListener('click', () => {
            poolSttText.value = '';
            setPoolSttStatus('Temizlendi.');
        });

        // --- Görselden metin (OCR) ---
        if (poolOcrPick) poolOcrPick.addEventListener('click', () => poolOcrFile.click());
        if (poolOcrDrop) {
            poolOcrDrop.addEventListener('click', (e) => {
                if (e.target === poolOcrPick || poolOcrPick.contains(e.target)) return;
                poolOcrFile.click();
            });
            poolOcrDrop.addEventListener('dragover', (e) => {
                e.preventDefault();
                poolOcrDrop.classList.add('dragover');
            });
            poolOcrDrop.addEventListener('dragleave', () => poolOcrDrop.classList.remove('dragover'));
            poolOcrDrop.addEventListener('drop', (e) => {
                e.preventDefault();
                poolOcrDrop.classList.remove('dragover');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePoolOcrFile(e.dataTransfer.files[0]);
            });
        }
        if (poolOcrFile) {
            poolOcrFile.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) handlePoolOcrFile(e.target.files[0]);
            });
        }
        if (poolOcrCopy) poolOcrCopy.addEventListener('click', () => {
            if (poolOcrText.value.trim()) copyTextToClipboard(poolOcrText.value.trim());
        });
        if (poolOcrDownload) poolOcrDownload.addEventListener('click', () => {
            if (poolOcrText.value.trim()) poolDownloadText(poolOcrText.value.trim(), 'nesilai-ocr');
        });

        function handlePoolOcrFile(file) {
            if (!file.type.startsWith('image/')) {
                poolOcrStatus.textContent = 'Lütfen bir görsel dosyası seç.';
                return;
            }
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const dataUrl = ev.target.result;
                poolOcrStatus.textContent = 'Metin taranıyor…';
                poolOcrText.value = '';
                if (window.NesilP2T) {
                    try {
                        const text = await window.NesilP2T.extractText(dataUrl, (p) => {
                            poolOcrStatus.textContent = `Taranıyor… %${p}`;
                        });
                        poolOcrText.value = text || '';
                        poolOcrStatus.textContent = text ? '✅ Metin çıkarıldı.' : 'ℹ️ Metin bulunamadı.';
                    } catch (err) {
                        poolOcrStatus.textContent = '⚠️ OCR başarısız oldu.';
                    }
                } else {
                    poolOcrStatus.textContent = 'OCR motoru yüklenemedi.';
                }
            };
            reader.readAsDataURL(file);
        }
    }

    function openSubscriptionModal() {
        updateSubscriptionUI();
        subscriptionModal.classList.remove('hidden');
        closeMobileSidebar();
    }

    function closeSubscriptionModal() {
        subscriptionModal.classList.add('hidden');
    }

    // ========================================================
    // Sohbet Yönetimi & Saklama (Storage)
    // ========================================================
    function loadChatsFromStorage() {
        try {
            const saved = localStorage.getItem('nesilai_chats_v2');
            chats = saved ? JSON.parse(saved) : [];
        } catch (e) {
            chats = [];
        }

        const savedCurrentId = localStorage.getItem('nesilai_current_chat_id');

        if (chats.length === 0) {
            createNewChat();
        } else {
            const found = chats.find(c => c.id === savedCurrentId);
            currentChatId = found ? found.id : chats[0].id;
            renderChatHistory();
            renderActiveChatMessages();
        }
    }

    function saveChatsToStorage() {
        localStorage.setItem('nesilai_chats_v2', JSON.stringify(chats));
        localStorage.setItem('nesilai_current_chat_id', currentChatId);
    }

    function getCurrentChat() {
        return chats.find(c => c.id === currentChatId);
    }

    function createNewChat() {
        const newChat = {
            id: 'chat_' + Date.now(),
            title: 'Yeni Sohbet',
            createdAt: new Date().toISOString(),
            messages: []
        };
        chats.unshift(newChat);
        currentChatId = newChat.id;
        saveChatsToStorage();
        renderChatHistory();
        renderActiveChatMessages();
        closeMobileSidebar();
        userInput.focus();
    }

    function deleteChat(chatId, e) {
        if (e) e.stopPropagation();
        chats = chats.filter(c => c.id !== chatId);
        if (chats.length === 0) {
            createNewChat();
        } else {
            if (currentChatId === chatId) {
                currentChatId = chats[0].id;
            }
            saveChatsToStorage();
            renderChatHistory();
            renderActiveChatMessages();
        }
        showToast('Sohbet silindi');
    }

    function renderChatHistory() {
        chatHistoryList.innerHTML = '';

        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
            
            const title = document.createElement('span');
            title.className = 'history-title';
            title.textContent = chat.title || 'Yeni Sohbet';

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-delete-chat';
            delBtn.innerHTML = '🗑️';
            delBtn.title = 'Sohbeti Sil';
            delBtn.addEventListener('click', (e) => deleteChat(chat.id, e));

            item.appendChild(title);
            item.appendChild(delBtn);

            item.addEventListener('click', () => {
                if (currentChatId !== chat.id) {
                    currentChatId = chat.id;
                    saveChatsToStorage();
                    renderChatHistory();
                    renderActiveChatMessages();
                    closeMobileSidebar();
                }
            });

            chatHistoryList.appendChild(item);
        });

        const activeChat = getCurrentChat();
        if (activeChat) {
            currentChatTitle.textContent = activeChat.title || 'Yeni Sohbet';
        }
    }

    function renderActiveChatMessages() {
        // Yalnızca mesaj satırlarını temizle; karşılama ekranı korunur
        chatMessages.querySelectorAll('.message-row').forEach(row => row.remove());

        const activeChat = getCurrentChat();

        if (!activeChat || activeChat.messages.length === 0) {
            if (!welcomeHero.isConnected) {
                chatMessages.insertBefore(welcomeHero, chatMessages.firstChild);
            }
            welcomeHero.style.display = 'flex';
            return;
        }

        welcomeHero.style.display = 'none';

        activeChat.messages.forEach(msg => {
            appendMessageToDom(msg, false);
        });

        scrollToBottom();
    }

    // ========================================================
    // Mesaj Ekleme & Görünüm (DOM Rendering)
    // ========================================================
    function appendMessageToDom(msg, shouldScroll = true) {
        welcomeHero.style.display = 'none';

        const row = document.createElement('div');
        row.className = `message-row ${msg.role}`
            + (msg.streaming ? ' streaming' : '')
            + (msg.isError ? ' error' : '');
        row.dataset.msgId = msg.id;

        if (msg.role === 'user') {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';

            if (msg.attachmentDataUrl) {
                const img = document.createElement('img');
                img.src = msg.attachmentDataUrl;
                img.className = 'user-attachment-thumb';
                img.alt = 'Yüklenen görsel';
                bubble.appendChild(img);
            }

            const textP = document.createElement('p');
            textP.textContent = msg.text;
            bubble.appendChild(textP);

            row.appendChild(bubble);
        } else {
            // Asistan Mesajı
            const avatar = document.createElement('div');
            avatar.className = 'assistant-avatar';
            avatar.textContent = 'AI';
            row.appendChild(avatar);

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'message-content-wrapper';

            const bubble = document.createElement('div');
            bubble.className = 'message-bubble';

            if (msg.isImageGen && msg.imageUrl) {
                const descP = document.createElement('p');
                descP.textContent = msg.text || 'İşte oluşturulan görsel:';
                bubble.appendChild(descP);

                if (window.NesilT2P) {
                    window.NesilT2P.appendImageCard(bubble, msg.imagePrompt || msg.text, msg.imageUrl);
                }
            } else {
                bubble.innerHTML = renderMarkdown(msg.text);
            }

            contentWrapper.appendChild(bubble);

            // Alt Eylemler (Seslendir / Kopyala)
            const actions = document.createElement('div');
            actions.className = 'message-actions';

            // 🔊 Seslendir butonu
            const speakBtn = document.createElement('button');
            speakBtn.className = 'btn-action-pill';
            speakBtn.innerHTML = '<span>🔊</span> <span>Dinle</span>';
            speakBtn.title = 'Seslendir (Yazıdan Sese)';

            speakBtn.addEventListener('click', () => {
                if (!checkQuota('tts')) return;

                if (window.NesilTTS) {
                    if (currentlySpeakingBtn === speakBtn) {
                        window.NesilTTS.stop();
                        speakBtn.innerHTML = '<span>🔊</span> <span>Dinle</span>';
                        speakBtn.classList.remove('speaking');
                        currentlySpeakingBtn = null;
                    } else {
                        if (currentlySpeakingBtn) {
                            currentlySpeakingBtn.innerHTML = '<span>🔊</span> <span>Dinle</span>';
                            currentlySpeakingBtn.classList.remove('speaking');
                        }

                        window.NesilTTS.speak(
                            msg.text,
                            () => {
                                incrementQuota('tts');
                                speakBtn.innerHTML = '<span>⏹️</span> <span>Durdur</span>';
                                speakBtn.classList.add('speaking');
                                currentlySpeakingBtn = speakBtn;
                            },
                            () => {
                                speakBtn.innerHTML = '<span>🔊</span> <span>Dinle</span>';
                                speakBtn.classList.remove('speaking');
                                if (currentlySpeakingBtn === speakBtn) currentlySpeakingBtn = null;
                            },
                            (err) => {
                                speakBtn.innerHTML = '<span>🔊</span> <span>Dinle</span>';
                                speakBtn.classList.remove('speaking');
                                if (currentlySpeakingBtn === speakBtn) currentlySpeakingBtn = null;
                                showToast('Seslendirme başlatılamadı', 'error');
                            }
                        );
                    }
                }
            });

            // 📋 Kopyala butonu
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn-action-pill';
            copyBtn.innerHTML = '<span>📋</span> <span>Kopyala</span>';
            copyBtn.title = 'Metni Kopyala';
            copyBtn.addEventListener('click', () => {
                copyTextToClipboard(msg.text);
            });

            actions.appendChild(speakBtn);
            actions.appendChild(copyBtn);
            contentWrapper.appendChild(actions);

            row.appendChild(contentWrapper);
        }

        chatMessages.appendChild(row);

        // Kod bloklarına sözdizimi renklendirmesi yap
        if (msg.role === 'assistant' && window.Prism && !msg.streaming) {
            Prism.highlightAllUnder(row);
        }

        if (shouldScroll) {
            scrollToBottom();
        }

        return row;
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ========================================================
    // Markdown & Kod Biçimlendirici
    // ========================================================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function renderMarkdown(text) {
        if (!text) return '';

        const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let html = '';
        let match;

        while ((match = codeBlockRegex.exec(text)) !== null) {
            const before = text.substring(lastIndex, match.index);
            html += formatTextElements(before);

            const lang = match[1] || 'javascript';
            const code = match[2];
            const escapedCode = escapeHtml(code);

            html += `
                <div class="code-container">
                    <div class="code-header">
                        <span>${lang}</span>
                        <button class="btn-copy-code" onclick="window.NesilAI_copyCode(this)">
                            <span>📋</span> Kodu Kopyala
                        </button>
                    </div>
                    <pre><code class="language-${lang}">${escapedCode}</code></pre>
                </div>
            `;
            lastIndex = codeBlockRegex.lastIndex;
        }

        if (lastIndex < text.length) {
            html += formatTextElements(text.substring(lastIndex));
        }

        return html;
    }

    function formatTextElements(text) {
        if (!text) return '';
        return text
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em>$1</em>')
            .replace(/`([^`]+)`/gim, '<code class="inline-code">$1</code>')
            .replace(/^\- (.*$)/gim, '<li>$1</li>')
            .replace(/^\* (.*$)/gim, '<li>$1</li>')
            .split(/\n\n+/)
            .map(p => {
                p = p.trim();
                if (!p) return '';
                if (p.startsWith('<h') || p.startsWith('<li>')) {
                    if (p.startsWith('<li>')) return `<ul>${p}</ul>`;
                    return p;
                }
                return `<p>${p.replace(/\n/g, '<br>')}</p>`;
            })
            .join('');
    }

    window.NesilAI_copyCode = function (button) {
        const pre = button.closest('.code-container').querySelector('pre code');
        if (pre) {
            copyTextToClipboard(pre.innerText);
            button.innerHTML = '<span>✅</span> Kopyalandı!';
            setTimeout(() => {
                button.innerHTML = '<span>📋</span> Kodu Kopyala';
            }, 2000);
        }
    };

    // ========================================================
    // Mesaj Gönderme & Yapay Zeka İşlemi (Main Handler)
    // ========================================================
    async function handleSendMessage(customPrompt = null) {
        const text = (customPrompt !== null ? customPrompt : userInput.value).trim();
        const attachment = activeAttachment;

        if (!text && !attachment) return;

        // Görsel oluşturma isteği mi kontrol et
        const isImage = window.NesilT2P && window.NesilT2P.isImagePrompt(text);

        // KOTA KONTROLÜ
        if (isImage) {
            if (!checkQuota('images')) return;
        } else {
            if (!checkQuota('chats')) return;
        }

        // Kullanıcı arayüzünü sıfırla
        userInput.value = '';
        clearAttachment();
        autoResizeTextarea();
        sendBtn.disabled = true;

        const activeChat = getCurrentChat();
        if (!activeChat) return;

        // Sohbet başlığını ilk mesaja göre güncelle
        if (activeChat.messages.length === 0) {
            activeChat.title = text.slice(0, 32) + (text.length > 32 ? '...' : '');
            currentChatTitle.textContent = activeChat.title;
            renderChatHistory();
        }

        // 1. Kullanıcı mesajını ekle
        const userMsg = {
            id: 'msg_' + Date.now(),
            role: 'user',
            text: text,
            attachmentDataUrl: attachment ? attachment.dataUrl : null,
            extractedText: attachment ? attachment.extractedText : null,
            timestamp: Date.now()
        };

        activeChat.messages.push(userMsg);
        appendMessageToDom(userMsg);
        saveChatsToStorage();

        // 2. Görsel oluşturma işlemi
        if (isImage) {
            incrementQuota('images');
            const visualPrompt = window.NesilT2P.extractImagePrompt(text);
            const imageUrl = window.NesilT2P.generateImageUrl(visualPrompt);

            const aiMsg = {
                id: 'msg_' + (Date.now() + 1),
                role: 'assistant',
                text: `"${visualPrompt}" için görsel oluşturuldu:`,
                isImageGen: true,
                imagePrompt: visualPrompt,
                imageUrl: imageUrl,
                timestamp: Date.now()
            };

            activeChat.messages.push(aiMsg);
            appendMessageToDom(aiMsg);
            saveChatsToStorage();

            checkAutoSpeak(aiMsg.text);
            return;
        }

        // 3. Normal Sohbet İşlemi (Kota Artır)
        incrementQuota('chats');

        // İlk parça gelene kadar gösterilen "yanıt hazırlanıyor" satırı
        const loadingRow = document.createElement('div');
        loadingRow.className = 'message-row assistant thinking';
        loadingRow.innerHTML = `
            <div class="assistant-avatar">AI</div>
            <div class="message-content-wrapper">
                <div class="thinking-bubble">
                    <span class="typing-dots"><i></i><i></i><i></i></span>
                    <span class="thinking-label">Yanıt hazırlanıyor</span>
                </div>
            </div>
        `;
        chatMessages.appendChild(loadingRow);
        scrollToBottom();

        // Akış halinde doldurulacak asistan mesajı
        const aiMsg = {
            id: 'msg_' + Date.now(),
            role: 'assistant',
            text: '',
            timestamp: Date.now(),
            streaming: true
        };

        let aiRow = null;
        let bubble = null;
        let renderedText = null;
        let renderQueued = false;
        let started = false;

        const paint = () => {
            renderQueued = false;
            if (!bubble || aiMsg.text === renderedText) return;
            renderedText = aiMsg.text;
            bubble.innerHTML = renderMarkdown(aiMsg.text);
        };

        const startAssistantMessage = () => {
            if (started) return;
            started = true;
            loadingRow.remove();
            activeChat.messages.push(aiMsg);
            aiRow = appendMessageToDom(aiMsg, false);
            bubble = aiRow.querySelector('.message-bubble');
        };

        // Sunucudan gelen her parça
        const onDelta = (chunk, fullText) => {
            aiMsg.text = fullText;
            startAssistantMessage();
            if (!renderQueued) {
                renderQueued = true;
                requestAnimationFrame(paint);
            }
            scrollToBottom();
        };

        try {
            await generateAiResponse(text, attachment, activeChat.messages, onDelta);

            // Akış desteklenmediyse cevap tek parça gelmiş olabilir
            startAssistantMessage();
            paint();

            aiMsg.streaming = false;
            if (aiRow) {
                aiRow.classList.remove('streaming');
                if (window.Prism) Prism.highlightAllUnder(aiRow);
            }

            saveChatsToStorage();
            checkAutoSpeak(aiMsg.text);
        } catch (error) {
            loadingRow.remove();
            console.error('AI yanıt hatası:', error);

            // Yarım kalan cevabı gösterme: hata mesajı yerine geçer
            const errorText = '⚠️ ' + describeAiError(error);

            startAssistantMessage();
            aiMsg.text = errorText;
            aiMsg.streaming = false;
            aiMsg.isError = true;
            renderedText = errorText;

            if (aiRow) {
                aiRow.classList.remove('streaming');
                aiRow.classList.add('error');
                if (bubble) bubble.innerHTML = renderMarkdown(errorText);
            }

            saveChatsToStorage();

            const needsSetup = !AI.isReady().ok || error.kind === 'auth' || error.kind === 'quota';
            showToast(needsSetup ? 'Yapay zeka kaynağı yeniden ayarlanmalı' : 'Yapay zekadan yanıt alınamadı', 'error');
            if (needsSetup) openSettingsModal();
        }
    }

    function checkAutoSpeak(text) {
        const autoSpeak = localStorage.getItem('nesilai_auto_speak') === 'true';
        if (autoSpeak && window.NesilTTS) {
            if (checkQuota('tts')) {
                incrementQuota('tts');
                window.NesilTTS.speak(text);
            }
        }
    }

    // ========================================================
    // Yapay Zeka Yanıt Motoru
    // Tüm istekler js/ai.js içindeki gerçek sağlayıcı katmanına gider.
    // Şablon / "sahte" cevap üretimi tamamen kaldırıldı: bir sağlayıcı
    // yanıt vermezse kullanıcı gerçek hatayı görür.
    // ========================================================
    const HISTORY_LIMIT = 20;

    // Sohbet bağlamını sağlayıcı formatına çevirir
    function buildConversation(userPrompt, attachment, historyMessages) {
        // Görsel üretim mesajları sohbet bağlamına girmez
        const history = (historyMessages || [])
            .filter(msg => !msg.isImageGen && typeof msg.text === 'string' && msg.text.trim())
            .slice(-HISTORY_LIMIT);

        const messages = history.map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.text
        }));

        // Son kullanıcı mesajı geçmişte yoksa ekle (çift gönderimi engelle)
        const last = messages[messages.length - 1];
        const isAlreadyLast = last && last.role === 'user' && last.content.trim() === userPrompt.trim();
        if (!isAlreadyLast) {
            messages.push({ role: 'user', content: userPrompt });
        }

        // Ekli görsel: OCR metni her sağlayıcıda, görselin kendisi vision destekliyorsa gönderilir
        if (attachment) {
            const target = messages[messages.length - 1];

            if (attachment.extractedText) {
                target.content += '\n\n[Görselden okunan metin (OCR)]\n' + attachment.extractedText;
            }

            const provider = AI.getProvider();
            if (attachment.dataUrl && provider.vision && /^data:image\//.test(attachment.dataUrl)) {
                const mime = (attachment.dataUrl.match(/^data:([^;]+);/) || [])[1] || 'image/png';
                target.images = [{ dataUrl: attachment.dataUrl, mimeType: mime }];
            }
        }

        return messages;
    }

    async function generateAiResponse(userPrompt, attachment, historyMessages, onDelta) {
        const messages = buildConversation(userPrompt, attachment, historyMessages);
        const result = await AI.chat({
            messages: messages,
            onDelta: onDelta
        });
        return typeof result === 'string' ? result : result.text;
    }

    // Sağlayıcı hatasını kullanıcıya yol gösteren bir mesaja çevirir
    function describeAiError(error) {
        const readiness = AI.isReady();
        const provider = readiness.provider;
        const kind = error && error.kind;

        const lines = [
            '**Yapay zekadan yanıt alınamadı.**',
            '',
            '> ' + (error && error.message ? error.message : 'Bilinmeyen hata')
        ];

        if (!readiness.ok) {
            lines.push('', 'Ayarlar → Yapay Zeka bölümünden bir sağlayıcı seçip anahtarını ekle, ardından **Bağlantıyı test et** butonunu kullan.');
        } else if (kind === 'auth') {
            lines.push('', 'Anahtar geçersiz görünüyor. Ayarlar → Yapay Zeka bölümünden güncelleyip **Bağlantıyı test et** ile doğrula.');
        } else if (kind === 'quota') {
            lines.push('', `Aktif sağlayıcı: **${provider.short}**. Ayarlar → Yapay Zeka bölümünden başka bir sağlayıcı ya da model seçmeyi dene.`);
        } else if (kind === 'network') {
            lines.push('', 'Bağlantını kontrol edip tekrar dene. Ağ engelleyicin isteği durduruyor olabilir.');
        } else {
            lines.push('', `Tekrar deneyebilir ya da Ayarlar → Yapay Zeka bölümünden ${provider.short} için farklı bir model seçebilirsin.`);
        }

        return lines.join('\n');
    }

    // ========================================================
    // Sesten Yazıya (Mikrofon ile Doğrudan Yazdırma)
    // ========================================================
    function toggleSpeechToText() {
        if (!window.NesilSTT) {
            showToast('Konuşma tanıma desteklenmiyor', 'error');
            return;
        }

        if (window.NesilSTT.isListening()) {
            window.NesilSTT.stop();
            micBtn.classList.remove('listening');
            showToast('Kayıt durduruldu');
        } else {
            // Kota kontrolü
            if (!checkQuota('stt')) return;

            const started = window.NesilSTT.start({
                onStart: () => {
                    incrementQuota('stt');
                    micBtn.classList.add('listening');
                    showToast('🎙️ Sizi dinliyorum, konuşabilirsiniz...');
                },
                onFinal: (text) => {
                    const current = userInput.value;
                    userInput.value = (current ? current + ' ' : '') + text;
                    autoResizeTextarea();
                    sendBtn.disabled = false;
                },
                onEnd: () => {
                    micBtn.classList.remove('listening');
                },
                onError: (err) => {
                    micBtn.classList.remove('listening');
                    showToast('Mikrofon hatası: ' + (err.error || 'Bilinmiyor'), 'error');
                }
            });

            if (!started) {
                showToast('Mikrofon açılamadı', 'error');
            }
        }
    }

    // ========================================================
    // Canlı Sesli Sohbet Modu (Voice Mode / ChatGPT Voice Style)
    // ========================================================
    function openVoiceMode() {
        if (!window.NesilSTT || !window.NesilTTS) {
            showToast('Sesli sohbet bu tarayıcıda tam desteklenmiyor', 'error');
            return;
        }

        if (!checkQuota('stt') || !checkQuota('tts')) return;

        isVoiceModeActive = true;
        voiceModal.classList.remove('hidden');
        closeMobileSidebar();

        startVoiceListeningLoop();
    }

    function closeVoiceMode() {
        isVoiceModeActive = false;
        voiceModal.classList.add('hidden');
        if (window.NesilSTT) window.NesilSTT.stop();
        if (window.NesilTTS) window.NesilTTS.stop();
        setOrbState('idle', 'Kapalı', '');
    }

    function setOrbState(state, statusText, transcript = '') {
        voiceOrb.className = `voice-orb ${state}`;
        voiceStatusText.textContent = statusText;
        if (transcript !== null) {
            voiceLiveTranscript.textContent = transcript ? `"${transcript}"` : '';
        }
    }

    function startVoiceListeningLoop() {
        if (!isVoiceModeActive) return;

        if (!checkQuota('stt')) {
            closeVoiceMode();
            return;
        }

        setOrbState('listening', 'Sizi dinliyorum...', 'Konuşmaya başlayabilirsiniz...');

        window.NesilSTT.start({
            onStart: () => {
                incrementQuota('stt');
                setOrbState('listening', 'Dinleniyor...');
            },
            onInterim: (interim) => {
                voiceLiveTranscript.textContent = `"${interim}..."`;
            },
            onFinal: async (finalSpeech) => {
                if (!isVoiceModeActive || !finalSpeech.trim()) return;

                window.NesilSTT.stop();
                setOrbState('thinking', 'Düşünüyor...', finalSpeech);

                try {
                    const activeChat = getCurrentChat();
                    const userMsg = {
                        id: 'msg_' + Date.now(),
                        role: 'user',
                        text: finalSpeech,
                        timestamp: Date.now()
                    };
                    activeChat.messages.push(userMsg);
                    appendMessageToDom(userMsg, false);

                    const response = await generateAiResponse(finalSpeech, null, activeChat.messages);

                    const aiMsg = {
                        id: 'msg_' + Date.now(),
                        role: 'assistant',
                        text: response,
                        timestamp: Date.now()
                    };
                    activeChat.messages.push(aiMsg);
                    appendMessageToDom(aiMsg, false);
                    saveChatsToStorage();

                    if (!checkQuota('tts')) {
                        closeVoiceMode();
                        return;
                    }

                    incrementQuota('tts');
                    setOrbState('speaking', 'Konuşuyor...', response.slice(0, 100) + '...');

                    window.NesilTTS.speak(
                        response,
                        null,
                        () => {
                            if (isVoiceModeActive) {
                                setTimeout(startVoiceListeningLoop, 600);
                            }
                        },
                        () => {
                            if (isVoiceModeActive) {
                                setTimeout(startVoiceListeningLoop, 600);
                            }
                        }
                    );
                } catch (e) {
                    setOrbState('idle', 'Hata oluştu');
                    setTimeout(startVoiceListeningLoop, 1500);
                }
            },
            onError: (err) => {
                console.warn('Voice mode STT hatası:', err);
            }
        });
    }

    // ========================================================
    // Görsel Yükleme & OCR (Photo to Text / Attachment)
    // ========================================================
    attachBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleAttachmentFile(e.target.files[0]);
        }
    });

    function handleAttachmentFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('Lütfen bir resim dosyası seçin', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const dataUrl = e.target.result;
            activeAttachment = {
                file: file,
                dataUrl: dataUrl,
                filename: file.name,
                extractedText: ''
            };

            attachmentThumbnail.src = dataUrl;
            attachmentFilename.textContent = file.name;
            attachmentStatus.textContent = '🔍 Metin taranıyor (OCR)...';
            attachmentPreviewBar.classList.remove('hidden');
            sendBtn.disabled = false;

            if (window.NesilP2T) {
                try {
                    const text = await window.NesilP2T.extractText(dataUrl, (p) => {
                        attachmentStatus.textContent = `🔍 Taranıyor... %${p}`;
                    });
                    activeAttachment.extractedText = text;
                    attachmentStatus.textContent = text ? '✅ Metin okundu' : 'ℹ️ Metin bulunamadı';
                    showToast('Görsel başarıyla analiz edildi');
                } catch (err) {
                    attachmentStatus.textContent = '⚠️ OCR başarısız oldu';
                }
            }
        };
        reader.readAsDataURL(file);
    }

    removeAttachmentBtn.addEventListener('click', clearAttachment);

    function clearAttachment() {
        activeAttachment = null;
        fileInput.value = '';
        attachmentPreviewBar.classList.add('hidden');
        if (!userInput.value.trim()) {
            sendBtn.disabled = true;
        }
    }

    // ========================================================
    // Ayarlar: Yapay Zeka Sağlayıcısı & Ses
    // ========================================================
    function loadSettings() {
        const autoSpeak = localStorage.getItem('nesilai_auto_speak') === 'true';
        if (settingAutoSpeak) settingAutoSpeak.checked = autoSpeak;

        // Sağlayıcı listesini doldur
        if (aiProviderSelect) {
            aiProviderSelect.innerHTML = '';
            Object.keys(AI.PROVIDERS).forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = AI.PROVIDERS[id].label;
                aiProviderSelect.appendChild(opt);
            });
            aiProviderSelect.value = AI.getSettings().provider;
        }

        const stored = AI.getSettings();
        if (aiTemperature) {
            aiTemperature.value = stored.temperature;
            if (aiTempVal) aiTempVal.textContent = Number(stored.temperature).toFixed(1);
        }

        syncProviderFields();
        updateAiStatusChip();
    }

    // Seçilen sağlayıcıya göre form alanlarını göster/gizle
    function syncProviderFields() {
        if (!aiProviderSelect) return;

        const provider = AI.getProvider(aiProviderSelect.value);
        const stored = AI.getSettings();

        if (aiModelInput) {
            aiModelInput.value = stored.models[provider.id] || provider.defaultModel || '';
            aiModelInput.placeholder = provider.defaultModel || 'model-adı';
        }

        if (aiModelList) {
            aiModelList.innerHTML = '';
            (provider.suggestedModels || []).forEach(modelId => {
                const opt = document.createElement('option');
                opt.value = modelId;
                aiModelList.appendChild(opt);
            });
        }

        if (aiKeyField) aiKeyField.classList.toggle('hidden', !provider.needsKey);
        if (aiKeyInput) {
            aiKeyInput.value = stored.keys[provider.id] || '';
            aiKeyInput.type = 'password';
        }
        if (aiKeyToggle) aiKeyToggle.textContent = 'Göster';

        if (aiBaseUrlField) aiBaseUrlField.classList.toggle('hidden', provider.id !== 'custom');
        if (aiBaseUrlInput) aiBaseUrlInput.value = (stored.baseUrls && stored.baseUrls[provider.id]) || '';

        if (aiKeyLink) {
            if (provider.keyUrl) {
                aiKeyLink.href = provider.keyUrl;
                aiKeyLink.classList.remove('hidden');
                aiKeyLink.textContent = provider.short + ' API anahtarı al ↗';
            } else {
                aiKeyLink.classList.add('hidden');
            }
        }

        if (aiProviderNote) {
            const parts = [];
            if (provider.keyHint) parts.push(provider.keyHint);
            if (provider.note) parts.push(provider.note);
            if (!provider.needsKey && provider.id !== 'custom') parts.push('API anahtarı gerekmez.');
            if (provider.vision) parts.push('Görsel okuma (vision) desteklenir.');
            aiProviderNote.textContent = parts.join(' ');
        }

        setTestResult('', '');
    }

    function setTestResult(kind, message) {
        if (!aiTestResult) return;
        aiTestResult.textContent = message || '';
        aiTestResult.className = 'ai-test-result' + (kind ? ' ' + kind : '');
    }

    // Formdaki değerleri kayıt nesnesine çevir
    function collectSettingsFromForm() {
        const provider = AI.getProvider(aiProviderSelect ? aiProviderSelect.value : undefined);
        const patch = { provider: provider.id };

        const model = aiModelInput ? aiModelInput.value.trim() : '';
        if (model) {
            patch.models = {};
            patch.models[provider.id] = model;
        }

        if (provider.needsKey && aiKeyInput) {
            patch.keys = {};
            patch.keys[provider.id] = aiKeyInput.value.trim();
        }

        if (provider.id === 'custom' && aiBaseUrlInput) {
            patch.baseUrls = {};
            patch.baseUrls[provider.id] = aiBaseUrlInput.value.trim();
        }

        if (aiTemperature) patch.temperature = parseFloat(aiTemperature.value) || 0.7;
        return patch;
    }

    // Aktif sağlayıcıyı üst çubukta göster
    function updateAiStatusChip() {
        if (!aiStatusChip) return;

        const readiness = AI.isReady();
        const provider = readiness.provider;

        if (aiStatusText) {
            if (readiness.ok) {
                aiStatusText.textContent = provider.short + ' · ' + AI.getModel(provider.id);
            } else if (readiness.reason === 'missing-key') {
                aiStatusText.textContent = provider.short + ' · anahtar gerekli';
            } else {
                aiStatusText.textContent = 'Sağlayıcı ayarla';
            }
        }

        aiStatusChip.classList.toggle('needs-setup', !readiness.ok);
        aiStatusChip.title = readiness.ok
            ? 'Aktif yapay zeka: ' + provider.label + ' (' + AI.getModel(provider.id) + ')'
            : 'Yapay zeka sağlayıcısı ayarlanmadı — tıkla ve anahtarını ekle.';

        if (welcomeProvider) {
            welcomeProvider.textContent = readiness.ok
                ? provider.short + ' · ' + AI.getModel(provider.id)
                : provider.short + ' (kurulum gerekli)';
        }

        if (welcomeSetupBtn) {
            welcomeSetupBtn.textContent = readiness.ok ? 'Kaynağı değiştir' : 'Anahtarını ekle';
        }

        // Composer'daki model seçici etiketi de aynı bilgiyi taşır
        if (modelPickerLabel && aiStatusText) {
            modelPickerLabel.textContent = aiStatusText.textContent;
        }
    }

    // ========================================================
    // Composer Model Seçici
    //   Mesaj kutusunun yanındaki model adına tıkla → tüm
    //   sağlayıcıların tüm modelleri tek menüde; seç, anında geç.
    //   Kendi API anahtarını ekleme Ayarlar → Yapay Zeka'dan yapılır.
    // ========================================================
    function buildModelMenu() {
        if (!modelMenu) return;
        const settings = AI.getSettings();
        const activePid = settings.provider;
        modelMenu.innerHTML = '';

        Object.keys(AI.PROVIDERS).forEach(pid => {
            if (pid === 'custom') return; // Özel uç nokta kurulumu ayarlardan yapılır
            const provider = AI.PROVIDERS[pid];
            const section = document.createElement('div');
            section.className = 'model-section' + (pid === activePid ? ' active-provider' : '');

            const head = document.createElement('div');
            head.className = 'model-section-head';
            const keyOwned = !provider.needsKey || (settings.keys[pid] || '').trim();
            head.innerHTML = `<span>${provider.short}</span>` +
                (provider.needsKey && !keyOwned ? '<span class="model-key-warn">🔑 anahtar gerekli (Ayarlar)</span>' : '') +
                (pid === activePid ? '<span class="model-current-tag">aktif</span>' : '');
            section.appendChild(head);

            (provider.suggestedModels || []).forEach(modelId => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'model-option' + (pid === activePid && settings.models[pid] === modelId ? ' selected' : '');
                item.dataset.search = (provider.short + ' ' + provider.label + ' ' + modelId).toLowerCase();
                item.innerHTML = `<span class="model-option-provider">${provider.short}</span><span class="model-option-name"></span>`;
                item.querySelector('.model-option-name').textContent = modelId;

                item.addEventListener('click', () => {
                    AI.saveSettings({ provider: pid, models: { [pid]: modelId } });
                    updateAiStatusChip();
                    hideModelPicker();
                    showToast(provider.short + ' · ' + modelId + ' seçildi', 'success');
                });

                section.appendChild(item);
            });

            modelMenu.appendChild(section);
        });
    }

    function filterModelMenu(q) {
        if (!modelMenu) return;
        const needle = (q || '').trim().toLowerCase();
        modelMenu.querySelectorAll('.model-section').forEach(section => {
            let visible = 0;
            section.querySelectorAll('.model-option').forEach(opt => {
                const show = !needle || (opt.dataset.search || '').includes(needle);
                opt.classList.toggle('hidden', !show);
                if (show) visible++;
            });
            section.classList.toggle('hidden', visible === 0);
        });
    }

    function toggleModelPicker() {
        if (!modelMenu) return;
        if (modelMenu.classList.contains('hidden')) {
            buildModelMenu();
            filterModelMenu(modelPickerSearch ? modelPickerSearch.value : '');
            modelMenu.classList.remove('hidden');
            if (modelPickerSearch) modelPickerSearch.focus();
        } else {
            hideModelPicker();
        }
    }

    function hideModelPicker() {
        if (modelMenu) modelMenu.classList.add('hidden');
    }

    function openSettingsModal() {
        loadSettings();
        settingsModal.classList.remove('hidden');
        closeMobileSidebar();
    }

    saveSettingsBtn.addEventListener('click', () => {
        localStorage.setItem('nesilai_auto_speak', settingAutoSpeak.checked ? 'true' : 'false');
        AI.saveSettings(collectSettingsFromForm());
        updateAiStatusChip();
        settingsModal.classList.add('hidden');
        showToast('Ayarlar kaydedildi', 'success');
    });

    if (aiProviderSelect) {
        aiProviderSelect.addEventListener('change', syncProviderFields);
    }

    if (aiTemperature) {
        aiTemperature.addEventListener('input', () => {
            if (aiTempVal) aiTempVal.textContent = parseFloat(aiTemperature.value).toFixed(1);
        });
    }

    if (aiKeyToggle && aiKeyInput) {
        aiKeyToggle.addEventListener('click', () => {
            const isHidden = aiKeyInput.type === 'password';
            aiKeyInput.type = isHidden ? 'text' : 'password';
            aiKeyToggle.textContent = isHidden ? 'Gizle' : 'Göster';
        });
    }

    if (aiStatusChip) {
        aiStatusChip.addEventListener('click', openSettingsModal);
    }

    if (welcomeSetupBtn) {
        welcomeSetupBtn.addEventListener('click', openSettingsModal);
    }

    if (aiTestBtn) {
        aiTestBtn.addEventListener('click', async () => {
            aiTestBtn.disabled = true;
            setTestResult('running', 'Bağlantı test ediliyor...');

            // Test, formdaki güncel değerlerle yapılsın
            AI.saveSettings(collectSettingsFromForm());

            try {
                const result = await AI.testConnection();

                if (aiModelList && result.models && result.models.length) {
                    aiModelList.innerHTML = '';
                    result.models.slice(0, 200).forEach(modelId => {
                        const opt = document.createElement('option');
                        opt.value = modelId;
                        aiModelList.appendChild(opt);
                    });
                    if (aiModelInput) aiModelInput.placeholder = result.models.length + ' model bulundu';
                }

                const seconds = (result.ms / 1000).toFixed(1);
                setTestResult('ok', 'Bağlantı başarılı · ' + result.model + ' · ' + seconds + 's');
                showToast('Yapay zeka bağlantısı çalışıyor');
            } catch (error) {
                setTestResult('error', error.message);
            } finally {
                aiTestBtn.disabled = false;
                updateAiStatusChip();
            }
        });
    }

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    openSettingsBtn.addEventListener('click', openSettingsModal);

    headerSettingsBtn.addEventListener('click', openSettingsModal);

    clearAllChatsBtn.addEventListener('click', () => {
        if (confirm('Tüm sohbet geçmişini silmek istediğinize emin misiniz?')) {
            chats = [];
            localStorage.removeItem('nesilai_chats_v2');
            createNewChat();
            settingsModal.classList.add('hidden');
            showToast('Tüm geçmiş temizlendi');
        }
    });

    // ========================================================
    // Yardımcı Fonksiyonlar & Olaylar
    // ========================================================
    function bindEvents() {
        // Yeni Sohbet
        newChatBtn.addEventListener('click', createNewChat);

        // Sidebar Mobil Aç/Kapa
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            sidebarBackdrop.classList.toggle('active');
        });
        sidebarBackdrop.addEventListener('click', closeMobileSidebar);

        // Abonelik Modalı Aç/Kapa
        openSubscriptionBtn.addEventListener('click', openSubscriptionModal);
        headerSubBtn.addEventListener('click', openSubscriptionModal);
        sidebarUpgradeBtn.addEventListener('click', openSubscriptionModal);
        closeSubModalBtn.addEventListener('click', closeSubscriptionModal);
        subscriptionBackdrop.addEventListener('click', closeSubscriptionModal);

        // Kupon ile Abonelik Aktifleştirme
        if (openCouponModalBtn) openCouponModalBtn.addEventListener('click', openCouponModal);

        // Üretim Havuzu
        initPool();
        if (closeCouponModalBtn) closeCouponModalBtn.addEventListener('click', closeCouponModal);
        if (couponBackdrop) couponBackdrop.addEventListener('click', closeCouponModal);
        if (couponActivateBtn) couponActivateBtn.addEventListener('click', handleCouponActivation);
        if (couponDoneBtn) couponDoneBtn.addEventListener('click', closeCouponModal);
        if (couponCodeInput) {
            couponCodeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleCouponActivation();
            });
        }

        // Composer Model Seçici
        if (modelPickerBtn) {
            modelPickerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleModelPicker();
            });
        }
        if (modelPickerSearch) {
            modelPickerSearch.addEventListener('input', () => filterModelMenu(modelPickerSearch.value));
            modelPickerSearch.addEventListener('click', (e) => e.stopPropagation());
        }
        document.addEventListener('click', (e) => {
            if (modelMenu && !modelMenu.classList.contains('hidden') && modelPickerWrap && !modelPickerWrap.contains(e.target)) {
                hideModelPicker();
            }
        });

        // Plan Seç Butonları
        selectPlanBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tier = btn.dataset.tier;
                if (tier) {
                    switchPlan(tier);
                }
            });
        });

        // Test Kotası Sıfırlama Butonu
        resetUsageBtn.addEventListener('click', () => {
            currentSubscription.usage = { images: 0, chats: 0, stt: 0, tts: 0 };
            saveSubscription();
            showToast('Kullanım kotaları sıfırlandı (Test) 🔄');
        });

        // Sesli Sohbet Butonları
        headerVoiceBtn.addEventListener('click', openVoiceMode);
        openVoiceModeBtn.addEventListener('click', openVoiceMode);
        closeVoiceModalBtn.addEventListener('click', closeVoiceMode);
        voiceEndBtn.addEventListener('click', closeVoiceMode);

        // Öneri Kartları
        suggestionCards.forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.dataset.prompt;
                if (prompt) {
                    handleSendMessage(prompt);
                }
            });
        });

        // Metin Kutusu & Gönder
        userInput.addEventListener('input', () => {
            autoResizeTextarea();
            sendBtn.disabled = !userInput.value.trim() && !activeAttachment;
        });

        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendBtn.disabled) {
                    handleSendMessage();
                }
            }
        });

        sendBtn.addEventListener('click', () => handleSendMessage());

        // Mikrofon Butonu (Sesi Yazıya Çevir)
        micBtn.addEventListener('click', toggleSpeechToText);

        // Tema değiştir
        if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

        // Escape ile en üstteki pencereyi kapat
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeTopModal();
        });

        // Sesli sohbette mikrofonu geçici olarak kapat
        voiceMuteBtn.addEventListener('click', () => {
            if (window.NesilSTT && window.NesilSTT.isListening()) {
                window.NesilSTT.stop();
                voiceMuteBtn.classList.add('muted');
                setOrbState('idle', 'Mikrofon kapalı', null);
            } else if (isVoiceModeActive) {
                voiceMuteBtn.classList.remove('muted');
                startVoiceListeningLoop();
            }
        });
    }

    // ========================================================
    // Tema
    // ========================================================
    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
    }

    function toggleTheme() {
        const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
    }

    // Escape: açık olan en üstteki pencereyi kapatır
    function closeTopModal() {
        if (!voiceModal.classList.contains('hidden')) {
            closeVoiceMode();
            return;
        }
        if (!settingsModal.classList.contains('hidden')) {
            settingsModal.classList.add('hidden');
            return;
        }
        if (!subscriptionModal.classList.contains('hidden')) {
            closeSubscriptionModal();
            return;
        }
        if (couponModal && !couponModal.classList.contains('hidden')) {
            closeCouponModal();
            return;
        }
        if (poolModal && !poolModal.classList.contains('hidden')) {
            closePoolModal();
        }
    }

    function autoResizeTextarea() {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 160) + 'px';
    }

    function closeMobileSidebar() {
        sidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('active');
    }

    function copyTextToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text)
                .then(() => {
                    showToast('Panoya kopyalandı');
                    return true;
                })
                .catch(() => fallbackCopy(text));
        }
        return Promise.resolve(fallbackCopy(text));
    }

    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();

        let copied = false;
        try {
            copied = document.execCommand('copy');
            showToast(copied ? 'Panoya kopyalandı' : 'Kopyalama başarısız', copied ? 'info' : 'error');
        } catch (e) {
            showToast('Kopyalama başarısız', 'error');
        }

        document.body.removeChild(ta);
        return copied;
    }

    function showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ========================================================
    // Paylaşılan Yardımcılar
    // Diğer modüller (tts, stt, ocr) bu fonksiyonları kullanır.
    // ========================================================
    AI.showToast = showToast;
    AI.copyToClipboard = copyTextToClipboard;

    // Başlat!
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

})();
