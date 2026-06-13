# PDF Smart Dictionary

A **completely free**, privacy-friendly Chrome/Edge (Manifest V3) extension that lets you open any PDF and instantly look up a word's **definition, meaning, synonyms, pronunciation, part of speech, and examples** just by clicking or highlighting it — plus optional **AI "Explain in Context"** powered by a **local Ollama** model.

- ✅ No paid services, no backend server, no database, **no API keys**
- ✅ Works fully offline *except* optional online dictionary lookups
- ✅ Local AI explanations run on your machine via Ollama (never leaves your computer)
- ✅ React + TypeScript + PDF.js, built with Vite

---

## Features

| Area | What you get |
| --- | --- |
| **PDF Viewer** | Upload/open local PDFs, drag & drop, smooth rendering of large PDFs (lazy page rendering), zoom, page navigation |
| **Word selection** | Click, double-click, or highlight any word — selectable text layer powered by PDF.js |
| **Dictionary popup** | Definition, meaning, part of speech, synonyms, example sentence, phonetic spelling, and pronunciation audio (with offline speech-synthesis fallback) |
| **Explain in Context** | Sends the word + surrounding paragraph to a **local** Ollama LLM (Llama 3, Qwen, Mistral, …) and streams a plain-language explanation |
| **Vocabulary** | Save words locally, search them, add notes, export to CSV |
| **History** | Recent lookups list |
| **UX** | Modern UI, light/dark/system themes, fast popup, responsive |
| **Shortcuts** | `Ctrl/Cmd+Shift+L` look up selection, `Ctrl/Cmd+Shift+U` open viewer, `Ctrl+O` open file |
| **Right-click** | "Explain … with PDF Smart Dictionary" context menu on any selected text |

Everything is stored locally with `chrome.storage.local`.

---

## Project structure

```
pdf-smart-dictionary/
├── manifest.config.ts        # Manifest V3 definition (via @crxjs/vite-plugin)
├── vite.config.ts            # Vite + React + CRXJS build config
├── index.html                # PDF viewer entry (main app)
├── package.json
├── tsconfig*.json
├── scripts/
│   └── make-icons.mjs        # Regenerate icon sizes from a source image
└── src/
    ├── assets/icons/         # 16/32/48/128 PNG icons (+ source)
    ├── background/
    │   └── service-worker.ts # Context menu, keyboard commands, toolbar action
    ├── components/
    │   └── Icons.tsx         # Inline SVG icons
    ├── lib/
    │   ├── dictionary.ts     # Free dictionaryapi.dev client + normalization
    │   ├── ollama.ts         # Local Ollama client (streaming, error handling)
    │   ├── pdf.ts            # PDF.js setup (worker wiring)
    │   ├── selection.ts      # Read selection + surrounding context
    │   ├── storage.ts        # Saved words / history / settings + CSV export
    │   ├── theme.ts          # Light/dark/system theming
    │   ├── types.ts          # Shared types
    │   └── useSettings.ts    # Settings hook
    ├── styles/global.css     # Design tokens + base styles
    ├── viewer/               # PDF viewer app
    │   ├── main.tsx
    │   ├── Viewer.tsx
    │   ├── PdfPageView.tsx   # Single page: canvas + selectable text layer
    │   ├── DictionaryPopup.tsx
    │   ├── viewer.css
    │   └── popup.css
    └── vocabulary/           # Vocabulary / history / settings page (options page)
        ├── index.html
        ├── main.tsx
        ├── Vocabulary.tsx
        └── vocabulary.css
```

---

## Prerequisites

- **Node.js 18+** and npm
- **Google Chrome** or **Microsoft Edge** (any recent version)
- *(Optional, for AI explanations)* **Ollama** — https://ollama.com

---

## Installation & build

```bash
# 1. Install dependencies
npm install

# 2. Build the production extension into ./dist
npm run build
```

The build output is written to `dist/`.

### Load it into Chrome / Edge (Developer Mode)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select the **`dist/`** folder.
5. The PDF Smart Dictionary icon appears in your toolbar — click it to open the viewer.

> To update after code changes, run `npm run build` again and click the **reload** ↻ icon on the extension card.

### Development mode (hot reload)

```bash
npm run dev
```

Then **Load unpacked** and point Chrome at the **`dist/`** folder that CRXJS generates/keeps in sync. Editing source files hot-reloads the extension automatically.

---

## How to use

1. Click the toolbar icon (or press `Ctrl/Cmd+Shift+U`) to open the viewer.
2. **Open PDF** (or drag & drop a file, or press `Ctrl+O`).
3. **Double-click or highlight** any word → the dictionary popup appears next to it.
4. In the popup you can:
   - 🔊 play pronunciation
   - ⭐ save the word to your vocabulary
   - ✨ **Explain in Context** (requires Ollama — see below)
5. Open **Vocabulary** (toolbar button) to search saved words, add notes, view recent lookups, and **export CSV**.

---

## Ollama integration (optional, 100% local & free)

"Explain in Context" asks a local LLM to explain the selected word using the surrounding paragraph. Nothing is sent to the cloud.

```bash
# 1. Install Ollama from https://ollama.com

# 2. Start the local server (usually auto-starts after install)
ollama serve

# 3. Pull a model (any of these work)
ollama pull llama3        # default
# ollama pull qwen2.5
# ollama pull mistral
```

Then in the extension go to **Vocabulary → Settings**:

- Set the **Ollama URL** (default `http://localhost:11434`).
- Set the **Model** (default `llama3`) — or click **Test connection** to auto-detect installed models.

### CORS note
The extension requests `http://localhost:11434` directly. The manifest already includes the
required `host_permissions`. If Ollama blocks the request, start it allowing the extension origin:

```bash
# macOS / Linux
OLLAMA_ORIGINS='*' ollama serve

# Windows (PowerShell)
$env:OLLAMA_ORIGINS='*'; ollama serve
```

If Ollama isn't running or the model isn't installed, the popup shows a friendly message with the exact command to fix it — the dictionary features keep working regardless.

---

## Privacy

- **Dictionary lookups** call the free, key-less [dictionaryapi.dev](https://dictionaryapi.dev) over HTTPS (the only network request, and only when you look up a word).
- **AI explanations** run entirely on your machine via Ollama.
- **Saved words, history, and settings** live in `chrome.storage.local` on your device.
- No analytics, no tracking, no accounts.

---

## Regenerating icons

```bash
node scripts/make-icons.mjs path/to/source.png
```
Center-crops to a square and emits `icon16/32/48/128.png` into `src/assets/icons/`.

---

## Tech & licensing

- [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) for rendering
- [@crxjs/vite-plugin](https://crxjs.dev/) for MV3 bundling
- [dictionaryapi.dev](https://dictionaryapi.dev) free dictionary data
- [Ollama](https://ollama.com) for local LLM inference

MIT licensed. Built to be free forever.
