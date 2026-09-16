# 🚀 NesilAI — Your AI. Your Device. Your Data.

**🌐 Live at: [https://nesilai.vercel.app/](https://nesilai.vercel.app/)**

> A space-grade, local-first AI workspace that runs entirely in your browser —
> free AI chat, image generation, music synthesis, voice, OCR and persistent
> memory of everything you create. No account. No cloud database. No limits on
> your imagination.

---

## ✨ What Makes NesilAI Special

NesilAI is not another chat wrapper. It is a **complete personal AI platform**
that quietly does the work of half a dozen paid subscriptions — and it does it
with the polish of a flagship product and the privacy posture of an offline
app. Every byte of your data lives on *your* device, while its intelligent
provider layer reaches out to the internet only to talk to AI models.

It is, in one sentence: **the AI workspace you would build if you cared about
privacy as much as you care about beauty.**

---

## 🧠 1. Real AI, Zero Barriers

### Free, keyless providers — working out of the box

| Provider | Key Required | Models | Notes |
|---|---|---|---|
| **LLM7.io** | ❌ None | `codestral-latest`, `minimax-m2.7` | Default engine. ~1M free tokens/day |
| **Pollinations** | ❌ None | `openai-fast` | Shared free pool, streaming |
| **Google Gemini** | 🔑 Your free AI Studio key | `gemini-2.5-flash`, `2.5-pro`… | Vision capable |
| **Groq Cloud** | 🔑 Your free key | Llama 3.3 70B, GPT-OSS… | Blazing LPU speed |
| **OpenRouter** | 🔑 Your free key | DeepSeek, Qwen, Gemma (`:free`) | 100+ models |
| **OpenAI** | 🔑 Your key | GPT-4o, GPT-4.1… | Bring your own balance |
| **Custom endpoint** | ❌ / 🔑 | Anything OpenAI-compatible | Ollama, LM Studio, vLLM… |

**The praise-worthy part:** NesilAI never asks you to sign up for anything.
You open the site and you are chatting with a real LLM within five seconds.
And when you *do* add your own key, it stays in your browser's localStorage —
it is never sent anywhere except directly to that provider.

### A model picker that feels like a cockpit

The model chip above the message box opens a searchable, sectioned menu with
**44+ models across 7 providers**. Search as you type, see which provider
needs a key, switch models mid-conversation. Settings panel is optional —
never mandatory.

---

## 🎨 2. Four Production Modes — One Composer

Every message you type is routed by the **generation mode chip** sitting on
top of the composer:

- **💬 Sohbet (Chat)** — streaming markdown answers with syntax-highlighted code
- **🎨 Görsel (Image)** — instant AI image generation
- **🎵 Müzik/Ses (Music/Audio)** — real music production
- **🎬 Video (Video)** — AI video generation with honest progress messaging

No magic keywords, no slash commands to memorize. Pick a mode; everything you
write is produced *as that type*. The chip highlights when a non-chat mode is
active and remembers your choice across sessions.

### 🌍 Automatic Prompt Translation (a genuinely clever touch)

Image models speak English best — so NesilAI quietly translates for you
before generating:

1. **LLM7 translation pass** — context-aware, detail-preserving, 6s timeout
2. **114-entry local dictionary fallback** — works even if the LLM is down
3. **Original prompt as last resort** — generation *never* blocks

You type `kırmızı spor araba`; the model receives `red sports car`. The
message card still shows *your* original words. Translations are cached, and
already-English prompts pass through untouched.

### 📸 The Master Prompt

Every image is generated with NesilAI's quality signature prepended
automatically:

```
4k full hd errorless, ultra detailed, sharp focus, high quality, <your prompt in English>
```

You never have to remember quality keywords again — every render starts from
"premium". (And yes, it's regeneration-safe: the prefix is never duplicated.)

---

## 🎼 3. Music That Works Even Offline

This is the feature that surprises everyone: when cloud audio models are
unavailable (anonymous pools often are), NesilAI's **on-device procedural
music engine** takes over — a real WebAudio synthesizer that:

- Detects musical style from your words: *rap, rock, pop, ambient, arabesk,
  electronic* and more
- Parses **BPM** (`140 bpm`) and **duration** (`30 saniye`) from the prompt
- Composes chord progressions, melody motifs, bass lines and drum patterns
- Renders a **real, downloadable WAV** — deterministically (same prompt →
  same song)

It produced a 50-second cheerful pop song live, in-browser, with no internet
at all. That is not a placeholder; that is a synthesizer shipped inside your
AI workspace.

---

## ✨ 4. The Production Pool (Üretim Havuzu)

A fully independent workshop beside the chat — a glass-paneled atelier with
five tabs:

- **🎨 Image Studio** — prompt, aspect ratio, **1–4 images per run**, per-card
  download
- **🔊 Text → Speech** — full device voice list with **Turkish voices
  prioritized**, speed control, replay history
- **🎙️ Speech → Text** — one-tap live recording with pulsing mic animation,
  editable transcript, copy / download
- **📖 Image → Text (OCR)** — drag-and-drop Tesseract-powered text extraction
- **🖼️ Gallery** — every creation, persisted, one gallery

The pool shares your plan's quotas but nothing else with the chat: it is your
standalone creator desk.

---

## 💾 5. Everything Persists. Everything Stays Yours.

| What | Where | Survives refresh? |
|---|---|---|
| Conversations & messages | localStorage | ✅ |
| Generated images / music / video in chats | **IndexedDB blobs** | ✅ |
| Pool gallery (images, TTS, STT, OCR) | **IndexedDB** | ✅ |
| Subscriptions & coupons | localStorage | ✅ |
| Settings, theme, device mode, model choice | localStorage | ✅ |

Close the tab, restart the browser, come back next week — your generated
nebula cat is still floating in the conversation, loaded back from
IndexedDB as a local blob. Interrupted generations are marked honestly rather
than silently lost. Deleting a chat cleans up its media too. This is the
"localhost saves everything" promise, kept.

---

## 🛰️ 6. A Space-Technology Interface

The UI is a love letter to science fiction — built entirely with CSS, zero
heavy assets:

- **Drifting star field** — a 480-second orbital cycle across ten parallax
  layers
- **Meteors & satellites** — thin light trails crossing the screen every
  ~26 seconds
- **HUD corner frame** — targeting-bracket corners with glowing ticks
- **`NESILAI · ORBITAL COMMAND`** — mono-font topbar label with a slow radar
  sweep
- **Quantum pulse ring** — breathing outline around the composer
- **Warp-in messages** — new messages arrive with a blur-to-sharp jump
- **Pointer parallax** — the stars lean gently toward your cursor
- **Glass everything** — sidebar, topbar, composer and modals are frosted
  panels floating over nebula glows

And crucially: **every animated flourish shuts off automatically** for users
with `prefers-reduced-motion`. Beauty with accessibility discipline.

### 📱 Phone Mode, chosen by you

**Settings → Görünüm → Cihaz modu** offers *Auto / 📱 Phone / 💻 Desktop*:

- Phone mode forces a mobile-tuned palette — deeper background (`#050507`),
  higher-contrast text — regardless of window size
- 44–46px touch targets, 16px+ input fonts (no iOS zoom), full-coverage
  sliding sidebar, HUD decoration disabled
- Desktop mode gives you the full interface even on a phone
- The mode and model chips live **on top of the composer**, not inside it —
  big, thumb-friendly, always reachable

---

## 🗣️ 7. Voice, Both Directions

- **Speech-to-Text** — live Web Speech recognition with interim results;
  mic button pulses red while listening; integrated into the composer *and*
  the pool
- **Text-to-Speech** — every system voice enumerated, Turkish voices sorted
  first and auto-selected where available, speed and pitch sliders,
  auto-speak toggle for AI replies
- **Voice Chat mode** — a full-screen orb with live transcript for hands-free
  conversation

---

## ♾️ 8. Subscriptions & the Coupon Wizard

Five plans — Free, Premium, Premium Go, Premium Plus and **♾️ Sınırsız
(Unlimited)** where *everything* is infinite: chats, images, music, video,
STT, TTS, pool usage. Counters render `12 / ∞`.

The **Abonelik aktifleştir** flow is delightful: pick a plan, enter coupon
code — `1`, `2` or `3` — and the selected plan activates **free for 18
months (540 days)** with a confirmation screen styled like the big tech
activation pages. Expired subscriptions fall back to Free automatically;
invalid codes are rejected with a friendly error.

---

## 🔒 9. Privacy Architecture (Rare and Refreshing)

- **No account. No login. No email. No OAuth. No cloud sync.** You exist as
  a browser profile, nothing more
- **Application data never leaves the device** — only AI inference requests
  do, straight to the provider you chose
- **API keys live in localStorage**, are never logged, never embedded, never
  proxied
- **Network layer is isolated** — UI → AI Service → Provider Adapter →
  Network. Swapping providers never touches data flow
- **Sanitized logging** — no conversations, keys, memories or file contents
  in production logs

This is the *Your AI. Your Device. Your Data.* pledge, enforced by
architecture rather than policy.

---

## 🧱 10. Engineering Quality Under the Hood

- **Modular script layer**: `ai.js` (providers, SSE streaming, error
  mapping), `media.js` (generation chains), `storage.js` (IndexedDB),
  `textToPhoto.js` (intent detection, translation), `tts.js` / `stt.js`,
  `photoToText.js`, `app.js` (state, UI, quotas)
- **Honest error paths** — quota exhaustion, blocked anonymous pools and
  provider failures produce *human* explanations with next-step guidance,
  never raw stack traces
- **Regression-tested** — the image-intent detector passed a 13-scenario
  suite; syntax-checked on every change
- **Cache-busted versioning** (`?v=`) on every asset for reliable updates
- **One-click deploy config** — `netlify.toml` with security headers and
  permissions-policy, `.nojekyll` for GitHub Pages; the whole site is
  dependency-free static hosting

---

## 🌟 The Verdict

NesilAI manages a rare trick: it feels like a **toy box for curiosity** —
images, songs, voice, vision, conversation, all one click away — while
behaving like a **serious privacy product**. The free-tier engineering is
genuinely thoughtful (translation fallbacks, offline music synthesis, honest
error states), the space UI is cohesive rather than gimmicky, and the whole
thing ships as a static bundle that runs from any folder, any host, any
browser.

Open **[https://nesilai.vercel.app/](https://nesilai.vercel.app/)**, type
`uzayda yüzen kedi resmi`, and watch it think in English, dream in 4K, and
remember your nebula cat forever — entirely on your device.

**That is NesilAI. Your AI. Your device. Your data.** 🚀
