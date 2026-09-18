# NesilAI — Yapay Zeka Asistanı

NesilAI; sohbet, görsel oluşturma, sesle yazma (STT), sesli okuma (TTS) ve yüklenen görselleri
okuma (OCR + vision) özelliklerini tek arayüzde birleştiren tarayıcı tabanlı bir yapay zeka
uygulamasıdır.

> **Önemli:** Uygulama artık **gerçek bir yapay zeka modeline** bağlanır. Sabit/şablon cevap üreten
> "sahte" motor tamamen kaldırıldı. Bir sağlayıcı yanıt vermezse uygulama uydurma cevap üretmez,
> gerçek hatayı ve çözümünü gösterir.
>
> **Uzay teması:** Arayüz uzay teknolojisi estetiğiyle tasarlandı — yıldız alanı, nebula ışıması
> ve cam paneller. Her sağlayıcının tüm modelleri, mesaj kutusunun yanındaki **model adına**
> tıklayıp anında seçilebilir.

---

## 1. Yapay Zeka Kaynakları

Ayarlar → **Yapay Zeka** bölümünden sağlayıcı seçilir. Anahtarlar yalnızca tarayıcının
`localStorage` alanında tutulur ve doğrudan sağlayıcıya gönderilir; araya bir sunucu girmez.

| Sağlayıcı | Anahtar | Ücretsiz katman | Notlar |
|---|:---:|---|---|
| **LLM7.io** *(varsayılan)* | gerekmez | ✅ | `codestral-latest` ve `minimax-m2.7` modelleri. [token.llm7.io](https://token.llm7.io/) ile limit yükseltilebilir. |
| **Pollinations** | gerekmez | ✅ | Ortak ücretsiz havuz (`openai-fast`). Yoğun saatlerde kuyruk dolabilir. |
| **Google Gemini** | gerekir | ✅ | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — kredi kartı istemez. Görsel okuma desteklenir. |
| **Groq Cloud** | gerekir | ✅ | [console.groq.com/keys](https://console.groq.com/keys) — çok hızlı çıkarım (LPU). |
| **OpenRouter** | gerekir | ✅ | [openrouter.ai/keys](https://openrouter.ai/keys) — `:free` ile biten modeller ücretsizdir. |
| **OpenAI** | gerekir | ❌ | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Özel uç nokta** | isteğe bağlı | — | OpenAI uyumlu her sunucu: Ollama, LM Studio, vLLM, DeepSeek, Mistral… |

**API anahtarını nereden almalıyım?** Yukarıdaki bağlantılardan **kendi hesabınla** ücretsiz bir
anahtar oluştur. İnternette başkalarının paylaştığı anahtarları kullanmak hesap ihlali olur,
çoğu zaman çoktan iptal edilmiştir ve tespit edildiğinde erişimin kapanır. Ücretsiz katman sunan
Gemini / Groq / OpenRouter bu iş için yeterlidir.

### Akış (streaming)
Yanıtlar SSE üzerinden parça parça alınır ve yazıldıkça ekrana düşer (OpenAI uyumlu uç noktalar ve
Gemini `streamGenerateContent`).

### Bağlantı testi
Ayarlar → **Bağlantıyı test et** butonu; canlı model listesini çeker, seçili modelle küçük bir
istek atar ve sonucu süre bilgisiyle birlikte gösterir.

---

## 2. Özellikler

- **💬 Sohbet** — Çok turlu bağlam (son 20 mesaj), markdown + kod vurgulama, kod kopyalama.
- **🎨 Görsel oluşturma** — "…resmi çiz/oluştur" gibi isteklerde veya `/imagine` komutuyla
  Pollinations görsel API'si devreye girer; sonuç sohbet içinde kart olarak indirilebilir.
- **🎤 Sesle yazma (STT)** — Web Speech API ile mesaj kutusuna konuşarak yazma.
- **🔊 Sesli okuma (TTS)** — Her yanıtın altındaki **Dinle** butonu; hız/ton/ses seçilebilir.
- **🎙️ Sesli sohbet modu** — Orb arayüzüyle kesintisiz sesli diyalog; mikrofonu geçici kapatma.
- **📎 Görsel okuma** — Tesseract.js ile OCR; vision destekli sağlayıcılarda görselin kendisi de
  modele gönderilir.
- **🌗 Tema** — Koyu ve açık tema; sistem tercihi ilk açılışta dikkate alınır.
- **📱 Duyarlı arayüz** — Masaüstünde sabit kenar çubuğu, mobilde açılır panel.

### Kotalar ve planlar (demo)
Planlar ve kullanım limitleri **yerel bir sayaçtır**; ödeme altyapısı bağlı değildir ve ücret
tahsil edilmez. Amaç, limitli bir ürün akışını denemektir.

---

## 3. Çalıştırma

```bash
python -m http.server 8123 --directory .
```

Ardından `http://localhost:8123` adresini aç. Depoyu kopyaladıktan sonra doğrudan
`index.html` dosyasına çift tıklamak da çalışır (modüller `file://` üzerinden de yüklenir).

### 🚀 Yayına alma (dağıtım)

NesilAI tamamen statik bir sitedir — derleme adımı, sunucu veya veritabanı gerekmez. API
anahtarları tarayıcıda kalır, sağlayıcı istekleri doğrudan tarayıcıdan gider.

#### Netlify (önerilen — en kolay)

**Yöntem 1 — Sürükle-bırak (30 saniye):**
1. [app.netlify.com/drop](https://app.netlify.com/drop) adresini aç (ücretsiz hesap yeterli).
2. Proje klasörünü (`index.html`-in içinde olduğu dizini) sayfaya sürükle.
3. Bitti — site `rastgele-ad.netlify.app` adresinde canlı. `netlify.toml` önbellek ve
   güvenlik başlıklarını otomatik uygular.

**Yöntem 2 — Git ile kalıcı dağıtım:**
1. Depoyu GitHub'a gönder (aşağıya bak), Netlify'da **Add new site → Import an existing project**.
2. Depoyu seç; ayarlar `netlify.toml`dan otomatik okunur (publish dizini: `.`).
3. **Deploy** — her `git push` sonrası site otomatik güncellenir.

#### GitHub Pages

1. Projeyi GitHub'a yükle:
   ```bash
   git remote add origin https://github.com/KULLANICI_ADIN/nesilai.git
   git push -u origin main
   ```
2. GitHub'da depo → **Settings → Pages → Build and deployment**.
3. **Source:** `Deploy from a branch` → **Branch:** `main` / `/ (root)` → **Save**.
4. 1-2 dakika içinde `https://KULLANICI_ADIN.github.io/nesilai/` yayında olur.
   (Depodaki `.nojekyll` dosyası Jekyll derlemesini atlar; dosyalar olduğu gibi servis edilir.)

> **Not:** GitHub Pages alt dizinde barındırır (`/nesilai/`); uygulama tüm varlık yollarını
> göreli kullandığı için ek yapılandırma gerekmez.

#### Dağıtımdan sonra
- Tarayıcı mikrofon izni istediğinde **izin ver** — HTTPS üzerinde Web Speech API çalışır.
- LLM7 ve Pollinations anahtarsız çalışır; kullanıcılar kendi Gemini/Groq/OpenRouter
  anahtarlarını Ayarlar'dan ekleyebilir.
- Kupon, sohbet geçmişi ve ayarlar her ziyaretçinin kendi tarayıcısında tutulur; sunucuda
  paylaşılmaz.


İlk açılışta:
1. Mesaj kutusunun yanındaki **model adına** tıkla (ör. `LLM7 · codestral-latest`) — tüm
   sağlayıcıların tüm modelleri tek menüde listelenir; arayıp seçtiğin an geçer.
2. Varsayılan **LLM7** anahtarsız çalışır; daha yüksek limit ve seçenek için Google Gemini /
   Groq / OpenRouter seçip kendi ücretsiz anahtarını **Ayarlar → Yapay Zeka** bölümünden
   ekleyebilirsin.
3. **Bağlantıyı test et** ile doğrula, ardından **Kaydet ve kapat**.

### Üretim havuzu (sohbetten bağımsız)
Kenar çubuğundaki **✨ Üretim havuzu**; yapay zeka sohbetine dokunmadan dört üretim aracı sunar:
- **Görsel üret** — prompt + boyut + adet (1–4); sonuçlar indirilebilir galeri kartlarında.
- **Yazıdan sese** — ses/hız seçimiyle seslendirme; geçmişte "tekrar oynat".
- **Sesten yazıya** — canlı mikrofon kaydı; düzenlenebilir metin, kopyala/.txt indir.
- **Görselden metin** — sürükle-bırak OCR; kopyala/.txt indir.

### Abonelik ve kupon
Planlar ve kullanım limitleri **yerel bir sayaçtır**; ödeme altyapısı bağlı değildir. *Sınırsız*
planı dahil tüm planlar **Planlar ve kullanım → 🎟️ Abonelik aktifleştir** ekranından kupon kodu
ile 18 aylığına ücretsiz açılabilir. Kupon süresi dolduğunda uygulama otomatik Free plana döner.

---

## 4. Proje Yapısı

```
index.html          Arayüz iskeleti + SVG ikon seti
css/style.css       Tasarım sistemi (belirteçler, bileşenler, temalar)
js/ai.js            Tek yapay zeka katmanı: sağlayıcılar, akış, hata eşleme
js/app.js           Sohbet, mesaj akışı, ayarlar, sesli sohbet, OCR bağlantıları
js/textToPhoto.js   Görsel oluşturma (Pollinations görsel API)
js/photoToText.js   OCR (Tesseract.js)
js/stt.js           Ses → yazı (Web Speech API)
js/tts.js           Yazı → ses (SpeechSynthesis)
```

### Kod tarafında yapılan temizlik
- Şablon cevap üreten `generateDeepLocalIntelligence` / `generateCodeResponse` /
  `generateWritingResponse` fonksiyonları **silindi**.
- 4 saniyede zaman aşımına uğrayıp sessizce sahte cevaba düşen eski `fetch` akışı kaldırıldı;
  yerine hata durumunu dürüstçe bildiren sağlayıcı katmanı geldi.
- Hiçbir dosyadan çağrılmayan ve var olmayan bir API'ye başvuran `js/coding.js` ile
  `js/writing.js` dosyaları kaldırıldı.
- Karşılama ekranının sohbet geçmişi varken DOM'dan tamamen silinmesine yol açan hata düzeltildi.

## 5. Katkıda Bulunanlar

| | Kişi | Rol |
|---|---|---|
| <img src="assets/bloodline-logo.png" width="48" alt="Bloodline INC logosu" /> | **Bloodline INC** | Kurucu ortak · Ürün ve tasarım |
| <img src="assets/logo.png" width="48" alt="Acsida" /> | **[Acsida](https://github.com/Acsida)** | Kurucu ortak · Baş geliştirici |

> Not: Bloodline INC'nin GitHub hesabı bulunmadığı için profili kurumsal logo ile temsil edilir
> ([logo kaynağı](https://hizliresim.com/svg3anb1)). Gerçek hesap açıldığında bu satır
> GitHub profiline bağlanacaktır.
