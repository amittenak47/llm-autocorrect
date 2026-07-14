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

## Commands

| Command | What it does |
| --- | --- |
| `Autocorrect: Toggle On/Off` | Turn the extension on or off (or click the status bar item) |
| `Autocorrect: Set API Key` | Save or clear your provider API key |
| `Autocorrect: Correct Selected Line` | Fix one selected line immediately (no Enter needed) |
| `Autocorrect: Translate Selection to Current File's Language` | Convert a selection to the file's language |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `autocorrect.enabled` | `true` | Master on/off switch |
| `autocorrect.provider` | `groq` | LLM provider |
| `autocorrect.model` | `""` | Model ID (empty = provider default) |
| `autocorrect.languages` | `["python"]` | Language IDs to activate (see below) |
| `autocorrect.line.requireDiagnostic` | `true` | Only call the LLM if the language server shows an error on that line |
| `autocorrect.line.debounceMs` | `800` | Delay after Enter before checking the previous line |
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

- **Code block capture window** — open a staging window to define exactly what gets sent to the LLM before a request goes out.
- **Documentation / comments** — request docstrings or comments for the previous line or for the current code block window.
- **Caveman-style comments** — ultra-short inline comments (`# get user`, `// loop nums`) generated on demand.
- **Queued execution** — batch fixes in a window and run them on your schedule instead of applying corrections immediately on Enter.
- **Testing other languages** — verify and tune line autocorrect for Go, Java, C/C++, Rust, Zig, and JS/TS beyond the current Python-focused defaults.

## License

PolyForm Noncommercial 1.0.0 — personal and noncommercial use OK; commercial use by companies is not permitted. See [LICENSE](LICENSE).

## Development

For contributors: clone, `npm install`, `npm run compile`, press **F5**. See [CONTRIBUTING.md](CONTRIBUTING.md) for maintainer-only publish notes.
