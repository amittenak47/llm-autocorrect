<p align="center">
  <img src="images/icon.png" width="128" alt="LLM Autocorrect icon">
</p>

<h1 align="center">LLM Autocorrect</h1>

<p align="center">
  <b><code>pritn</code> → <code>print</code></b><br>
  LLM-powered autocorrect for code in <b>VS Code</b> and <b>Cursor</b>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com"><img src="https://img.shields.io/badge/VS%20Code-Marketplace-b68235?style=flat-square" alt="VS Code Marketplace"></a>
  <a href="https://open-vsx.org"><img src="https://img.shields.io/badge/Open%20VSX-Cursor-1a1917?style=flat-square" alt="Open VSX"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-PolyForm%20NC-8a6228?style=flat-square" alt="License"></a>
</p>

---

The extension itself is the same in both editors — only the **language server (LSP)** setup differs.

- **Line autocorrect** — press **Enter** and the line you just left may be fixed (typos, syntax). You'll see a brief highlight when it changes.
- **Paste-translate** — paste code that looks like another language and get an offer to convert it. Nothing is replaced without your OK.
- **Block capture** — stage exactly what gets sent to the LLM: select a block, or record one as you type (faint green highlight), then send it for correction — with a confirm + token estimate first.
- **Docs & caveman comments** — on-demand docstrings/comments for a selection or the previous line, or ultra-short inline comments (`# get user`, `// loop nums`).
- **Queued fixes** — optionally stage Enter-fixes in a review queue (amber highlight) and apply them on your schedule instead of immediately.

You bring your own API key (Groq is free and works well). Keys are stored in the editor's secret storage, not in your settings files.

## Quick start

1. **Install** the extension:
   - **VS Code** — [Visual Studio Marketplace](https://marketplace.visualstudio.com) or a `.vsix`
   - **Cursor** — [Open VSX](https://open-vsx.org), or **Extensions → ⋯ → Install from VSIX** (VS Code Marketplace alone does not list extensions in Cursor search)
2. **Set your API key** — Command Palette → **`Autocorrect: Set API Key`** → choose provider → paste key.
3. **Set up Python LSP** for your editor — see [Language server setup](#language-server-setup-vs-code-vs-cursor) below.
4. **Open a `.py` file** and try: type `pritn("hello"` on one line, press **Enter** on the next line.

The status bar (bottom right) shows on/off and a spinner during requests. Click it to toggle.

Logs: **View → Output** → **LLM Autocorrect**.

## Groq setup (recommended)

Groq is the default provider: free tier, no credit card, fast.

1. Sign up at [console.groq.com](https://console.groq.com)
2. **API Keys** → **Create API Key** → copy it (starts with `gsk_`, shown once)
3. Command Palette → **`Autocorrect: Set API Key`** → **`groq`** → paste key

Default model (when `autocorrect.model` is empty): **`llama-3.1-8b-instant`**.

Free tier is rate-limited (~30 requests/min). Fine for daily coding; upgrade on Groq if you hit limits.

### Pick a small, fast model (save tokens)

Line autocorrect sends a short prompt per fix — you do **not** need a large model. Smaller models are faster, cheaper, and less likely to hit Groq's per-request token cap.

| Provider | Good defaults | Avoid for line fixes |
| --- | --- | --- |
| Groq | `llama-3.1-8b-instant` (default), `llama-3.1-70b-versatile` if you need more accuracy | 70B+ for every keystroke — slower, burns TPM |
| Gemini | `gemini-2.5-flash-lite` (default) | Pro / large context models on small edits |
| Anthropic | `claude-haiku-4-5-20251001` (default) | Opus / Sonnet for single-line typos |
| Ollama | `llama3.2`, `phi3`, `gemma2:2b` | 70B local models unless you have the GPU headroom |

Set explicitly if you want:

```json
"autocorrect.model": "llama-3.1-8b-instant"
```

**Tips to waste fewer tokens:** keep `autocorrect.line.requireDiagnostic` on when your language server works (skips clean lines), use line mode instead of translating huge selections, and enable `autocorrect.debug` only while troubleshooting.

### Other providers

| Provider | Notes |
| --- | --- |
| `gemini` | [Google AI Studio](https://aistudio.google.com) API key |
| `anthropic` | [Anthropic Console](https://console.anthropic.com) API key |
| `openai-compatible` | Set `autocorrect.baseUrl` (e.g. `http://localhost:11434/v1` for Ollama) |

Set the provider in settings: `autocorrect.provider`.

## Commands & hotkeys

All hotkeys share the chord prefix **`Ctrl+Alt+A`** (**`Cmd+Alt+A`** on macOS): press the prefix, release, then press the second key.

| Command | Hotkey | What it does |
| --- | --- | --- |
| `Autocorrect: Toggle On/Off` | — | Turn the extension on or off (or click the status bar item) |
| `Autocorrect: Set API Key` | — | Save or clear your provider API key |
| `Autocorrect: Correct Selected Line` | — | Fix one selected line immediately (no Enter needed) |
| `Autocorrect: Translate Selection to Current File's Language` | — | Convert a selection to the file's language |
| `Autocorrect: Correct Selected Block` | `Ctrl+Alt+A B` | Fix the selected multi-line block (reverse capture: the selection is the block) |
| `Autocorrect: Start Block Capture` | `Ctrl+Alt+A S` | Drop a start mark and highlight everything you type from here |
| `Autocorrect: End Block Capture & Correct` | `Ctrl+Alt+A E` | Send the captured block (start mark → cursor) for correction |
| `Autocorrect: Cancel Block Capture` | `Ctrl+Alt+A Escape` | Abandon the capture without sending anything |
| `Autocorrect: Document Selection / Previous Line` | `Ctrl+Alt+A D` | Add docstrings/comments to the selection, captured block, or previous line |
| `Autocorrect: Caveman Comments` | `Ctrl+Alt+A C` | Ultra-short inline comments (`# get user`) for the same targets |
| `Autocorrect: Review Queued Fixes` | `Ctrl+Alt+A Q` | Open the queue: check fixes to apply, uncheck to discard |
| `Autocorrect: Apply All Queued Fixes` | `Ctrl+Alt+A Enter` | Apply everything in the queue |
| `Autocorrect: Clear Queued Fixes` | — | Empty the queue without applying |
| `Autocorrect: Toggle Queued Fix Mode` | — | Switch between apply-on-Enter and queue-for-review |

## Block capture

Two ways to define exactly what gets sent to the LLM before any request goes out — no popup window, the block lives in your editor:

- **Reverse** — select the code, hit `Ctrl+Alt+A B`. The native selection is the block.
- **Advance** — hit `Ctrl+Alt+A S`, type; a faint green dashed highlight tracks the block from the start mark to your cursor. Hit `Ctrl+Alt+A E` to send it (or `Ctrl+Alt+A Escape` to cancel).

Before anything is sent you get a confirmation with the line count and a token estimate (disable with `autocorrect.block.confirmBeforeSend: false`). Whole lines are sent — what you saw highlighted is what goes out.

## Docs & caveman comments

Both commands target, in priority order: your **selection**, else the **block being captured**, else the **previous non-blank line** above the cursor.

- **Document** (`Ctrl+Alt+A D`) — proper docstrings for functions/classes plus brief comments; the code itself is never changed.
- **Caveman** (`Ctrl+Alt+A C`) — ultra-short inline comments appended to lines that do real work (`# get user`, `// loop nums`). If the model changes the line structure, nothing is applied.

## Queued fixes

Set `autocorrect.queue.enabled: true` (or run `Autocorrect: Toggle Queued Fix Mode`) and Enter-fixes are **staged instead of applied**: the line gets a faint amber highlight, the status bar shows `(N queued)`, and nothing changes until you say so.

- `Ctrl+Alt+A Q` opens the review list — check the fixes you want, uncheck to discard, Esc keeps the queue untouched.
- `Ctrl+Alt+A Enter` applies everything.
- Queued line numbers follow your edits; if you rewrite a queued line yourself, its stale fix is dropped automatically. Manual `Correct Selected Line` still applies immediately.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `autocorrect.enabled` | `true` | Master on/off switch |
| `autocorrect.provider` | `groq` | LLM provider |
| `autocorrect.model` | `""` | Model ID (empty = provider default) |
| `autocorrect.languages` | `["python"]` | Language IDs to activate (see below) |
| `autocorrect.line.requireDiagnostic` | `true` | Only call the LLM if the language server shows an error on that line |
| `autocorrect.line.debounceMs` | `800` | Delay after Enter before checking the previous line |
| `autocorrect.block.confirmBeforeSend` | `true` | Confirm (with token estimate) before a captured block is sent |
| `autocorrect.queue.enabled` | `false` | Stage Enter-fixes in the review queue instead of applying them |
| `autocorrect.debug` | `false` | Verbose logs in the LLM Autocorrect output channel |

See **Settings → LLM Autocorrect** for the full list.

### Supported languages

**Python works out of the box** — it's the only language enabled by default.

Other languages are **built in but not fully tested yet**. You can try them by adding their VS Code language ID to `autocorrect.languages` and installing that language's extension (e.g. rust-analyzer for Rust, gopls for Go). Quality may vary until we've tested each one.

`python`, `go`, `java`, `c`, `cpp`, `rust`, `zig`, `javascript`, `typescript`

Example — Python and TypeScript:

```json
"autocorrect.languages": ["python", "typescript"]
```

You also need a language server that reports diagnostics in **Problems** if you use `autocorrect.line.requireDiagnostic`.

## Language server setup (VS Code vs Cursor)

LLM Autocorrect does **not** ship a language server. It reads squiggles from whatever LSP your editor already runs. Setup is the main difference between VS Code and Cursor.

**Shared extension settings** (both editors):

```json
{
  "autocorrect.languages": ["python"],
  "autocorrect.line.requireDiagnostic": true
}
```

Set `requireDiagnostic` to `false` if you want fixes on Enter without waiting for squiggles (uses more API calls).

---

### VS Code (Python)

| Step | What to do |
| --- | --- |
| Extensions | Install **Python** (`ms-python.python`) + **Pylance** (`ms-python.vscode-pylance`) |
| Interpreter | Command Palette → **`Python: Select Interpreter`** |
| Language server | **Pylance** (default when both extensions are installed) |

**Recommended `settings.json`:**

```json
{
  "python.languageServer": "Pylance",
  "python.analysis.typeCheckingMode": "basic",
  "python.analysis.diagnosticMode": "workspace",
  "autocorrect.line.requireDiagnostic": true
}
```

**Verify:** type `pritn("x")` in a `.py` file → **View → Problems** should list errors. If empty, run **`Python: Restart Language Server`**.

---

### Cursor (Python)

Microsoft **Pylance does not work** in Cursor. Use **Anysphere Python** instead.

| Step | What to do |
| --- | --- |
| Uninstall | **Cursor Pyright** (`anysphere.cursorpyright`), **Pylance** (`ms-python.vscode-pylance`) if present |
| Extensions | Install **Python** by **Anysphere** (`anysphere.python`) — search `publisher:"Anysphere"` or open `cursor:extension/anysphere.python` |
| Interpreter | Command Palette → **`Python: Select Interpreter`** |
| Language server | **`Default`** (Anysphere's bundled server — not Pylance, not standalone Cursor Pyright) |

**Recommended `settings.json` (verified on Cursor):**

```json
{
  "python.languageServer": "Default",
  "cursorpyright.analysis.typeCheckingMode": "all",
  "autocorrect.line.requireDiagnostic": false
}
```

| Setting | VS Code | Cursor |
| --- | --- | --- |
| `python.languageServer` | `"Pylance"` | `"Default"` |
| Analysis settings | `python.analysis.*` | `cursorpyright.analysis.*` |
| `requireDiagnostic` | `true` works well with Pylance | `false` recommended until squiggles are reliable; set `true` once **Problems** shows errors |

**Verify:** type `pritn("x")` → check **View → Problems**. Run **`Python: Restart Language Server`** if needed.

---

### Other languages (both editors)

Add the language ID to `autocorrect.languages` and install that language's extension + LSP (e.g. **rust-analyzer** for Rust, **gopls** for Go). Same extension code in VS Code and Cursor — only the language-server extension differs per ecosystem. Non-Python languages are not fully tested yet; see [Upcoming features](#upcoming-features).

## How it behaves

**Line mode**

- Triggers when you press **Enter** (not on every keystroke).
- Skips blank lines and comments.
- With `requireDiagnostic: true`, waits for a language-server error on that line before calling the LLM — **no API call** until then.
- Applies at most one corrected line; you can undo with **Ctrl+Z**.

**Paste-translate**

- Detects paste that looks like a different language than the file.
- Always asks before replacing anything.

**Privacy**

- Your API key stays in the editor's secret storage.
- Code is sent to whichever provider you chose (Groq, Gemini, etc.) when a correction runs.

## Troubleshooting

| Problem | Try |
| --- | --- |
| Nothing on Enter | Open a `.py` file; confirm Python is in `autocorrect.languages` |
| `no LSP squiggle` in logs | **VS Code:** confirm Pylance + interpreter. **Cursor:** use Anysphere Python + settings above, or set `requireDiagnostic` to `false` |
| Manual works, Enter doesn't | Use **Correct Selected Line**, or disable the diagnostic gate |
| `413` / token limit (Groq) | Selection too large; use single-line mode or a shorter selection |
| No logs at all | Test in a **code file**, not the Output panel |
| Extension Development Host (F5) | Install extensions and set API key **in that window** too |

Enable `"autocorrect.debug": true` for detailed logs.

## Upcoming features

- **Testing other languages** — verify and tune line autocorrect for Go, Java, C/C++, Rust, Zig, and JS/TS beyond the current Python-focused defaults.
- **Vim/Neovim port** — reverse capture as Visual mode + `:'<,'>LLMCorrect`, advance capture via marks/extmarks.

## License

PolyForm Noncommercial 1.0.0 — personal and noncommercial use OK; commercial use by companies is not permitted. See [LICENSE](LICENSE).

## Development

For contributors: clone, `npm install`, `npm run compile`, press **F5**. See [CONTRIBUTING.md](CONTRIBUTING.md) for maintainer-only publish notes.
