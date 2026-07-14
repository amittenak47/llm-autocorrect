# LLM Autocorrect

A VS Code / Cursor extension with two modes built on one LLM pipeline:

1. **Line autocorrect** — when you press Enter, the line you just left is checked for
   typos/syntax errors and silently fixed (with a brief highlight so you notice).
2. **Paste-translate** — pasting code that looks like a different language (e.g. C++
   into a `.py` file) pops a notification offering to convert the whole block. Nothing
   is ever replaced without confirmation.

## Setup

```
npm install
npm run compile
```

Press **F5** in VS Code or Cursor to launch an Extension Development Host with the extension loaded.

Then in the **host window** (not the project window):

1. Run **`Autocorrect: Set API Key`** from the command palette and paste your key
   (stored in secret storage, never in settings files).
2. Pick a provider in settings (`autocorrect.provider`): `groq` (default, fastest),
   `gemini`, `anthropic`, or `openai-compatible` (set `autocorrect.baseUrl`, works
   with Ollama/LM Studio/vLLM).
3. Open a Python file and type something broken, e.g. `pritn("hello"` — press Enter.

The status bar item (right side) shows on/off state and a spinner during requests;
click it to toggle. The **LLM Autocorrect** output channel logs every correction.

## Groq setup (recommended)

Groq is the default provider: free tier, no credit card, fast inference.

### 1. Get an API key

1. Sign up at [console.groq.com](https://console.groq.com)
2. Open **API Keys** → **Create API Key**
3. Copy the key immediately (shown once; starts with `gsk_`)

Free-tier limits are rate-based (~30 requests/min, token caps per model). Enough for development and light use.

### 2. Store the key in the extension

In the **Extension Development Host** (or after installing the `.vsix`):

1. Command Palette → **`Autocorrect: Set API Key`**
2. Choose **`groq`**
3. Paste your `gsk_...` key

The key is saved in VS Code secret storage, not in `settings.json`.

### 3. Confirm settings

Default settings work out of the box:

```json
{
  "autocorrect.provider": "groq",
  "autocorrect.model": "",
  "autocorrect.languages": ["python"]
}
```

Leave `autocorrect.model` empty to use **`llama-3.1-8b-instant`**.

### 4. Smoke test

1. Open a `.py` file in the host window
2. Type `pritn("hello"` on one line
3. Press **Enter** on the next line
4. Check **Output → LLM Autocorrect**

You should see either a correction or a diagnostic-gate message (see below).

### 5. Optional: verify Groq directly

```bash
curl https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"llama-3.1-8b-instant\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hi\"}]}"
```

## Squiggles / diagnostics (Cursor & VS Code)

Line autocorrect can wait for a **language-server squiggle** before calling the LLM
(`autocorrect.line.requireDiagnostic`, default `true`). This check is **local only** —
it reads the same diagnostics as the **Problems** panel. It does **not** call Groq.

If you never see red/yellow underlines, the extension will log:

```text
skip line N: no LSP squiggle within 1500ms (no API call made)
```

### Cursor

Microsoft **Pylance** (`ms-python.vscode-pylance`) is not supported in Cursor. Avoid
running it alongside Cursor's Python stack — they conflict.

**Extensions (verified setup):**

1. **Uninstall** these if present:
   - **Cursor Pyright** (`anysphere.cursorpyright`)
   - **Pylance** (`ms-python.vscode-pylance`)
2. **Install** **Python** by **Anysphere** (`anysphere.python`)
   - Search Extensions → `publisher:"Anysphere"` → **Python**
   - Or open: `cursor:extension/anysphere.python`
3. Select a Python interpreter: Command Palette → **`Python: Select Interpreter`**
4. Add these to **User** settings (`Ctrl+,` → open `settings.json`):

```json
{
  "autocorrect.line.requireDiagnostic": false,
  "python.languageServer": "Default",
  "cursorpyright.analysis.typeCheckingMode": "all"
}
```

| Setting | Why |
| --- | --- |
| `requireDiagnostic: false` | Reliable Enter-triggered fixes when LSP squiggles are slow or missing |
| `python.languageServer: "Default"` | Uses Anysphere's bundled Python language server |
| `typeCheckingMode: "all"` | Maximum diagnostics in **Problems** (optional if you re-enable the diagnostic gate) |

**Check that squiggles work (optional, for diagnostic gate):**

1. Open a `.py` file
2. Type `pritn("x")` or `x =` (incomplete line)
3. You should see underlines and entries in **View → Problems**

If Problems is empty, run **`Python: Restart Language Server`** from the command palette.

**Extension Development Host:** the host is a separate window. Install **Anysphere Python**
there too, or test in your main Cursor window after installing from a `.vsix`.

### VS Code

1. Install **Python** + **Pylance** (`ms-python.vscode-pylance`)
2. Select an interpreter: **`Python: Select Interpreter`**
3. Recommended settings:

```json
{
  "python.languageServer": "Pylance",
  "python.analysis.typeCheckingMode": "basic",
  "python.analysis.diagnosticMode": "workspace"
}
```

### No squiggles? Workarounds

| Option | Setting |
| --- | --- |
| Skip the diagnostic gate (always call LLM on Enter) | `"autocorrect.line.requireDiagnostic": false` |
| Manual fix without Enter | Select line → **`Autocorrect: Correct Selected Line`** |
| More time for LSP | `"autocorrect.line.diagnosticWaitMs": 3000` |

Enable `"autocorrect.debug": true` to see detailed gate logs in **LLM Autocorrect** output.

## How API calls stay rare and safe

- Line mode only fires on Enter, and only if the language server reports an
  error/warning on that line (`autocorrect.line.requireDiagnostic`, on by default).
  Blank and comment lines are skipped before any network call.
- The model must return either exactly `UNCHANGED` or a single corrected line;
  anything else (multi-line, empty, whitespace-only diff) is discarded.
- Edits are re-validated against the buffer before applying: if the line changed,
  or the cursor moved onto it, the correction is dropped. In-flight requests are
  cancelled when you keep editing. A single undo reverts any correction.
- Paste-translate never auto-replaces — it always asks first, and re-checks that
  the pasted text is still intact before and after the LLM call.

## Languages

Enabled via `autocorrect.languages` (default: `["python"]`). Supported profiles:
python, go, java, c, cpp, rust, zig, javascript, typescript. Suggested rollout
order: Python → Go → Java/C/C++ → Rust/Zig (verify quality with your chosen model
before enabling the harder ones).

Adding a language = one entry in `src/languages.ts` (name for prompts + comment
syntax for the pre-filter) plus optional detection heuristics for paste mode.

## Commands

| Command | What it does |
| --- | --- |
| `Autocorrect: Toggle On/Off` | Master switch (also: click the status bar item) |
| `Autocorrect: Set API Key` | Store/clear a provider key in secret storage |
| `Autocorrect: Correct Selected Line` | Fix the selected line (bypasses diagnostic gate) |
| `Autocorrect: Translate Selection to Current File's Language` | Manual paste-translate on a selection |

## Tests

```bash
npm test
```

Manual cases: `tests/python_line_autocorrect.py` (see `tests/README.md`).

