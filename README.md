# AI Autocorrect

A VS Code extension with two modes built on one LLM pipeline:

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

Press **F5** in VS Code to launch an Extension Development Host with the extension loaded.

Then in the dev host:

1. Run **`Autocorrect: Set API Key`** from the command palette and paste your key
   (stored in VS Code secret storage, never in settings files).
2. Pick a provider in settings (`autocorrect.provider`): `groq` (default, fastest),
   `gemini`, `anthropic`, or `openai-compatible` (set `autocorrect.baseUrl`, works
   with Ollama/LM Studio/vLLM).
3. Open a Python file and type something broken, e.g. `pritn("hello"` — press Enter.

The status bar item (right side) shows on/off state and a spinner during requests;
click it to toggle. The **AI Autocorrect** output channel logs every correction.

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
| `Autocorrect: Translate Selection to Current File's Language` | Manual paste-translate on a selection |
