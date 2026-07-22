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

Terminal-style control over what you send to the LLM: stage a selection, set modifiers, then **E** (send now) or **Shift+E** (enqueue). No inline ghost-text autocomplete.

The extension is the same in VS Code and Cursor — only **language server (LSP)** setup differs.

## Features (v0.1.0)

| Feature | Summary |
| --- | --- |
| **Line autocorrect** | On **Enter**, the line you left may be fixed (typos, syntax). Brief highlight on change. |
| **Modal menu** | Double-tap **`Ctrl`** — hotkey-driven workflow without leaving the editor. |
| **Immediate fix** | **A** (block) or **C** (line) — send to LLM immediately, no staging. |
| **Stage Workflow** | **Shift+A** (block) or **Shift+C** (line) → green highlight → set modifiers → **E** send now or **Shift+E** enqueue. |
| **Stage Window** | **S** → W/S (up/down) A/D (start/end) controls to select a block → **E** closes selection window and enters staged mode → set modifiers → **E** send now or **Shift+E** enqueue. |
| **Stage Modifiers** | Before finalizing the send, add modifiers: defaults to **best-guess fix** · **D** documentation · **F** caveman · **X** custom prompt · **1**–**5** context tiers · **M** / **Shift+M** LLM profile. |
| **Stage Context** | **1** lines above/below the target · **2** enclosing `def` / `class` / `function` header · **3** recent edit hunks in this file · **4** imports + signatures from other open editor tabs · **5** last large copy/selection snippet. Tiers **3**–**5** require `context.ringEnabled`. |
| **Multi-profile LLM** | Groq, Gemini, Anthropic, local llama-server side by side. Choose profile with **M** / **Shift+M** during the modifier step (before **E** / **Shift+E**); that profile owns the request and its queue slot. |
| **Queue mode** (`queue.mode`) | **Mutually exclusive.** **Checkpoint review** (`reviewChanges`, default): enqueue runs the LLM; **Q** / **Shift+Q** review **proposed edits** before apply (amber). **Deferred batch** (`deferExecution`): enqueue stores **tasks** only (blue dotted); **Q** / **Shift+Q** run selected tasks — LLM + immediate apply, **parallel per profile** (no diff review). |
| **Per-profile concurrency** | Each LLM profile has its own async request pool (`maxConcurrent`: default **1** localhost, **2** cloud). Deferred batch and all LLM calls share the limit — not OS threads, but independent in-flight caps per endpoint. |
| **Region lock** | Overlapping enqueue prompts first (**Replace** / **Expand & merge** / **Revert & continue** / **Cancel**). Queue border color = LLM profile. Applied fixes live in a **revert ledger** until reverted. |
| **Queued staged requests** | **Shift+E** enqueues (behavior depends on `queue.mode`). **Q** = current profile; **Shift+Q** = all profiles. |
| **Review before apply (Enter)** | `queue.enabled` — Enter still autocorrects; uses the active `queue.mode` (review changes vs defer task). |
| **Manual-only Enter** | `disableAutocorrect` — no automatic Enter fixes; call the LLM only when you use menu/staged keys. |
| **LSP or deliberate** | **Automatic:** Enter can require an LSP squiggle first (`line.requireDiagnostic`). **Deliberate:** menu/staged sends on demand (`fix.requireDiagnostic` optional). **Off:** `disableAutocorrect` stops Enter autocorrect entirely. |
| **Paste-translate** | Paste foreign-language code → offer to translate (never silent replace). |
| **Local inference** | `openai-compatible` + localhost → **60s** default timeout. |

See [CHANGELOG.md](CHANGELOG.md) for the full v0.1.0 release notes.

You bring your own API key. Keys live in the editor's secret storage, not in settings files.

---

## Quick start

1. **Install** — VS Code Marketplace, Open VSX, or `.vsix`.
2. **API key** — Command Palette → **`Autocorrect: Set API Key`**.
3. **Python LSP** — see [Language server setup](#language-server-setup-vs-code-vs-cursor).
4. **Try it** — open `.py`, type `pritn("hello"` on one line, press **Enter** on the next.

**Status bar** (bottom right): on/off, spinner, queue count (`3 queued · groq:2 local:1`). Click to toggle extension.

**Logs:** View → Output → **LLM Autocorrect**.

---

## Open the menu

| Action | Keys |
| --- | --- |
| Enter menu mode | Double-tap **`Ctrl`** |
| Exit menu (no staged block) | **`Esc`** |

While in menu or staged mode, the status bar lists available keys.

---

## Keyboard reference

### Menu mode

| Key | Action |
| --- | --- |
| **A** | Fix block — **immediate** |
| **Shift+A** | Stage selection → staged mode |
| **C** | Fix line — **immediate** |
| **Shift+C** | Stage cursor line → staged mode |
| **S** | Staged Window — keyboard block sizing (WASD) |
| **Q** | Review queue — **current profile** only |
| **Shift+Q** | Review queue — **all profiles** |
| **Esc** | Exit menu (clears staged block) |

### Staged mode (after Shift+A, Shift+C, or Staged Window **E**)

See [Stage Modifiers](#stage-modifiers) for full tutorials (**7**–**11**).

#### Modifiers

| Key | Modifier |
| --- | --- |
| **D** | Modifier: **documentation** (docstrings / comment blocks) |
| **F** | Modifier: **caveman** (short inline comments) |
| *(none)* | Modifier: **best-guess fix** (default) |
| **X** | Modifier: custom prompt note (per request; saved with queued items) |
| **1** | Context tier: lines above/below target |
| **2** | Context tier: enclosing `def` / `class` / `function` header |
| **3** | Context tier: recent edit hunks in this file (`ringEnabled`) |
| **4** | Context tier: imports + signatures from other open tabs (`ringEnabled`) |
| **5** | Context tier: last copy/selection snippet (`ringEnabled`) |
| **M** | Cycle LLM profile (choose before send) |
| **Shift+M** | Pick LLM profile (QuickPick; choose before send) |

#### Send

| Key | Action |
| --- | --- |
| **E** | **Send now** — apply to file |
| **Shift+E** | **Enqueue** — hold for review |
| **A** / **C** | Immediate fix shortcuts (skip staging) |
| **Esc** | Cancel staged block |

### Staged Window (after **S**)

| Key | Action |
| --- | --- |
| **W** / **S** | Move selection end up / down |
| **A** / **D** | Move to line start / end |
| **E** | Finish sizing → **staged mode** (not an LLM send yet) |
| **Esc** | Cancel Staged Window |

---

## Visual indicators

| In editor | Meaning |
| --- | --- |
| Green dashed lines | Staged block |
| Colored left border | Active LLM profile |
| **1–5** before first staged line | Context tier toggles (inline, not line-number gutter) |
| Modifier dot (fix / docs / caveman) | Filled circle in the **line-number gutter** and inline before the first staged line — blue fix, purple docs, orange caveman |
| Amber / blue dashed lines | Queued edits or tasks — **left border color = LLM profile** |

Status bar shows modifiers and token estimate, e.g. `fix · @Groq free · ctx:12 · ~840tok`.

---

## Tutorials — command flows

Each tutorial assumes you opened the menu unless noted.

### 1. Enter line autocorrect (hands-free)

**When:** You are typing normally and want typos fixed as you go.

1. Enable `autocorrect.line.enabled` (default on).
2. Type a line with a typo, e.g. `pritn("hi")`.
3. Press **Enter** on the next line.
4. After a short debounce, if the LSP reports an error on the previous line, the extension calls the LLM and may replace that line (brief highlight).

**Tips**

- Default `line.requireDiagnostic: true` — no squiggle, no API call (saves tokens).
- Set `line.requireDiagnostic: false` to fix on Enter even without LSP errors. **Token cost:** every Enter on a non-blank line can trigger an LLM call after debounce, even when the line is already fine (you still pay for the prompt; the extension skips apply if the model returns the same text).
- Want Enter fixes to **queue** instead of applying right away? See tutorial **15** — Enter queue mode (`queue.enabled` + `queue.mode`).
- Want to **stop Enter fixes entirely** and only call the LLM when you ask? See tutorial **16** (`disableAutocorrect`).

---

### 2. Immediate line fix (C)

**When:** You want one line corrected right now.

1. Put the cursor on the line (or just below it).
2. Open the menu → **C**.
3. Status bar spins; the line updates or you see “already correct” / “skipped”.

Does not use staged mode. Respects `fix.requireDiagnostic` if enabled (default off — sends anytime).

---

### 3. Immediate block fix (A)

**When:** You selected a chunk of code and want it fixed immediately (no staging, no modifiers).

1. Select the lines to fix.
2. Open the menu → **A**.
3. The selection is sent as a block fix; result replaces the selection.

---

### 4. Stage a block fix (Shift+A)

**When:** You selected a block with the mouse and want the full staged workflow — modifiers, then send or enqueue.

1. Select the code block.
2. Open the menu → **Shift+A** — green staged highlight appears.
3. Set [Stage Modifiers](#stage-modifiers) (tutorials **7**–**11**) as needed.
4. **E** send now (tutorial **12**) or **Shift+E** enqueue (tutorial **13**).

---

### 5. Stage a single line fix (Shift+C)

**When:** Same as tutorial 4 but for a single line without selecting manually.

1. Open the menu → **Shift+C** — stages the cursor line (or previous non-blank line).
2. Set [Stage Modifiers](#stage-modifiers) → **E** (tutorial **12**) or **Shift+E** (tutorial **13**).

---

### 6. Stage a custom block selection (S → WASD → E)

**When:** The block is easier to size with the keyboard than a mouse selection — same modifier → send flow as **Stage Workflow**, but the block is sized with WASD first.

1. Open the menu → **S** — Staged Window starts at cursor.
2. **W** / **S** — extend end up/down; **A** / **D** — line start/end.
3. **E** — finish sizing → enters **staged mode** (not an LLM send yet).
4. Set [Stage Modifiers](#stage-modifiers) → **E** (tutorial **12**) or **Shift+E** (tutorial **13**).

---

## Stage Modifiers

Set these in **staged mode** (green highlight) **before** **E** or **Shift+E** (tutorials **12**–**13**). Status bar shows what is active.

| Key | Modifier |
| --- | --- |
| *(default)* | **best-guess fix** |
| **D** | **documentation** — tutorial 7 |
| **F** | **caveman** — tutorial 8 |
| **X** | Custom prompt (per request) — tutorial 9 |
| **1**–**5** | Context tiers — tutorial 10 |
| **M** / **Shift+M** | LLM profile — tutorial 11 |

### 7. Add docstrings (modifier **D**)

**When:** Add documentation without changing code lines.

1. Stage a block (tutorials 4–6).
2. **D** — modifier switches to **documentation**.
3. Optional: **X** (tutorial 9); **1**/**2** (tutorial 10).
4. **E** (tutorial 12) or **Shift+E** (tutorial 13).

Palette alternative: **`Autocorrect: Add Docstrings / Comments`** on a selection (uses default modifiers and active profile).

Validation rejects output that alters code or invents new classes. Docs modifier is **still being refined** for accuracy.

---

### 8. Caveman comments (modifier **F**)

**When:** Ultra-short inline comments (`# get user`, `// loop nums`).

1. Stage a block.
2. **F** — modifier switches to **caveman**.
3. Optional: **X** (tutorial 9); context tiers (tutorial 10).
4. **E** (tutorial 12) or **Shift+E** (tutorial 13).

Line count must not change or the result is skipped. Caveman modifier is **still being refined** for accuracy.

Palette: **`Autocorrect: Caveman Comments`**.

---

### 9. Custom prompt (modifier **X**)

**When:** This send needs a **one-off** instruction — tighter than the default modifier, specific to the block you are about to send.

1. Stage a block (tutorials 4–6).
2. Press **X** — enter a custom prompt, e.g.:
   - `only fix the typo, don't refactor`
   - `preserve all variable names`
   - `add types but don't change logic`
3. The note shows in the status bar and is prepended to this request's prompt.
4. **E** (tutorial 12) or **Shift+E** (tutorial 13) — custom prompt is sent and **saved on queued items**.

**X is not global context.** It applies to **one** staged send. For conventions on **every** request, use `autocorrect.prompt.prefix` (tutorial 17). **X** stacks on top of the global prefix when both are set.

---

### 10. Context tiers (modifiers **1**–**5**)

**When:** You need more (or less) supplementary context in the prompt. Toggle in staged mode **before** **E** / **Shift+E** (tutorials 12–13).

| Key | Tier | What it adds |
| --- | --- | --- |
| **1** | Nearby | `line.contextLines` above + `contextLinesBelow` below the target block/line |
| **2** | Signature | Single header line of the enclosing `def` / `class` / `function` |
| **3** | Recent edits | Last edit hunks you made in this file (diff-style snippets) |
| **4** | Open tabs | Import lines + function/class signatures from other visible editor tabs |
| **5** | Yank | Text from your last large selection or copy in this session |

Tiers **3–5** require `"autocorrect.context.ringEnabled": true`.

Defaults come from `context.defaultTiers`. Token budget: profile `contextPolicy` (`minimal` 512 / `standard` 1024 / `extended` 2048 tok) or `context.tokenBudget` override.

---

### 11. Multi-profile LLM (modifiers **M**, **Shift+M**)

**When:** Different models for different jobs — e.g. Groq for quick fixes, local llama-server for large context.

**When to pick a profile:** During staged mode, **before** **E** or **Shift+E** (tutorials 12–13). **M** cycles; **Shift+M** opens QuickPick. The profile you pick is used for that send and recorded on queued items. Use **Shift+Q** (tutorial 14) to review if you enqueued to multiple profiles.

**Setup**

```json
{
  "autocorrect.profiles": [
    {
      "id": "groq",
      "label": "Groq free",
      "provider": "groq",
      "contextPolicy": "minimal",
      "timeoutMs": 5000,
      "maxConcurrent": 3
    },
    {
      "id": "local",
      "label": "llama-server",
      "provider": "openai-compatible",
      "baseUrl": "http://127.0.0.1:8080/v1",
      "model": "local",
      "contextPolicy": "extended",
      "timeoutMs": 60000,
      "maxConcurrent": 1
    }
  ],
  "autocorrect.activeProfile": "groq"
}
```

Set API key per profile: **Autocorrect: Set API Key**.

**Usage**

1. Stage a block.
2. **M** cycles profiles (updates global `activeProfile`) or **Shift+M** picks from list.
3. **E** (tutorial 12) / **Shift+E** (tutorial 13) sends via that profile.

Legacy `autocorrect.provider` / `model` / `baseUrl` still work when `profiles` is empty (single `"default"` profile).

**Concurrency:** Each profile caps simultaneous LLM requests (`maxConcurrent`). Defaults: **1** for localhost, **2** for cloud. Deferred batch **Q** runs tasks in parallel across profiles and up to each profile's limit — not OS threads, but separate async pools per endpoint.

**Local llama-server**

```bash
llama-server -m /path/to/model.gguf --host 127.0.0.1 --port 8080
```

Use an **instruct/chat** model via `/v1/chat/completions`. Timeout defaults to **60s** on localhost when `timeoutMs` is `0`.

---

### 12. Send now (E)

**When:** You have staged a block (tutorials **4**–**6**) and set [Stage Modifiers](#stage-modifiers) (tutorials **7**–**11**). You want the LLM result applied to the file **immediately**.

1. Green staged highlight must be active.
2. Press **E** — sends with current modifiers; result replaces the staged block.

Default modifier is **best-guess fix**. Status bar shows active modifiers and token estimate.

---

### 13. Enqueue send (Shift+E)

**When:** Same staging and modifiers as tutorial **12**, but you want to **queue** instead of applying immediately. Behavior depends on **`queue.mode`** — pick one (mutually exclusive):

| Setting value | Name | **Shift+E** does | **Q** / **Shift+Q** does |
| --- | --- | --- | --- |
| **`reviewChanges`** | **Checkpoint review** (default) | Calls LLM **now**; stores proposed edit (amber) | Review **edits** — apply checked, discard unchecked |
| **`deferExecution`** | **Deferred batch** | Stores **task** only — no LLM yet (blue dotted) | Run checked tasks — LLM + apply immediately (parallel per profile) |

1. Stage and set modifiers (tutorials **4**–**11**).
2. Press **Shift+E**.
3. Open the menu → **Q** or **Shift+Q** (tutorial **14**).

---

### 14. Review queue — **Q** (current profile), **Shift+Q** (all profiles)

**When:** You enqueued with **Shift+E** (tutorial **13**) or used Enter queue mode (tutorial **15**).

**Checkpoint review** (`reviewChanges`) — review **proposed edits**

1. Open the menu → **Q** (current profile) or **Shift+Q** (all).
2. QuickPick shows `original → corrected` previews.
3. Checked items **apply**; unchecked are **discarded**.

**Deferred batch** (`deferExecution`) — run **queued tasks**

1. Open the menu → **Q** or **Shift+Q**.
2. QuickPick lists pending **tasks** (op, lines, snippet) — no diff yet.
3. Checked tasks run (**LLM + immediate apply**, up to each profile's `maxConcurrent`); unchecked are discarded.

**Palette shortcuts**

- **Review Queued Fixes** — all profiles (same as **Shift+Q**).
- **Apply All Queued Fixes** — apply all **checkpoint review** items without picker (deferred batch queue ignored).

---

### 15. Enter queue mode (`queue.enabled`)

**When:** You want **Enter** autocorrect to queue instead of applying immediately. Uses the active **`queue.mode`**:

- **Checkpoint review** — Enter calls LLM; amber lines; **Q** reviews edits.
- **Deferred batch** — Enter queues tasks; blue dotted lines; **Q** runs tasks in parallel per profile.

1. Set `"autocorrect.queue.enabled": true` or run **Toggle Review Before Apply Mode**.
2. Type and press **Enter** as usual.
3. When ready, **Q** / **Shift+Q** (tutorial **14**).

Manual **C** / staged **E** still apply immediately unless you use **Shift+E**.

---

### 16. Disable Enter autocorrect (`disableAutocorrect`)

**When:** You do **not** want automatic line-by-line corrections while you type. You only want to call the LLM when you deliberately ask — immediate fix (**C** / **A** / staged **E**) or enqueue for later review (staged **Shift+E**, tutorial **13**).

**This setting has nothing to do with the queue.** It turns off Enter-triggered checks and API calls entirely. That avoids unnecessary LLM use when you are just drafting code.

1. Set `"autocorrect.disableAutocorrect": true` or run **Toggle Enter Autocorrect Off**.
2. Type normally — **Enter** does not trigger fixes or queue anything.
3. When you want a fix: open the menu → **C** or **A** for immediate apply, or **Shift+A** / **Shift+C** → [Stage Modifiers](#stage-modifiers) → **E** or **Shift+E**.

Status bar shows **`Autocorrect (manual)`** while Enter autocorrect is off.

---

### 17. Global context (`prompt.prefix`)

**When:** Every LLM call should inherit the same project conventions — framework, style, file role — without pressing **X** each time.

```json
"autocorrect.prompt.prefix": "Flask API. Use type hints. Prefer pathlib."
```

- Prepended to **every** user message (Enter, **C**, **A**, staged **E**, etc.).
- Groq does not cache this — you pay tokens on each request.
- Stacks with modifier **X** when both are set (**X** is per-send; prefix is global — tutorial **9**).

---

### 18. Paste-translate

**When:** You pasted code in the wrong language.

1. Paste a block that looks like a different language than the file.
2. Extension offers to translate — accept or dismiss.
3. Never replaces without confirmation.

Palette: **`Autocorrect: Translate Selection`**.

---

### 19. Command palette & slash menu

**Command Palette** — user-facing commands only (internal hotkey commands are hidden).

| Command | Effect |
| --- | --- |
| Enter Menu Mode | Same as double-tap **`Ctrl`** |
| Correct Line Near Cursor | Immediate line fix |
| Correct Selected Block | Immediate block fix |
| Add Docstrings / Comments | Docs on selection / staged |
| Caveman Comments | Caveman on selection / staged |
| Review Queued Fixes | All profiles |
| Apply All Queued Fixes | Apply entire queue |
| Clear Queued Fixes | Empty queue |
| Toggle Review Before Apply Mode | Enter fixes → review before apply |
| Set API Key | Per profile |
| Command Menu (QuickPick) | `/menu`, `/block`, `/line`, etc. |

---

## Groq setup (recommended)

1. [console.groq.com](https://console.groq.com) → API key (`gsk_…`).
2. **Autocorrect: Set API Key** → groq.

Default model: **`llama-3.1-8b-instant`**. Free tier ~30 req/min.

**Save tokens:** keep `line.requireDiagnostic` on; use staged tiers sparingly on Groq (`contextPolicy: minimal`).

### Other providers

| Provider | Notes |
| --- | --- |
| `gemini` | Google AI Studio API key |
| `anthropic` | Anthropic Console API key |
| `openai-compatible` | Ollama `http://localhost:11434/v1`, llama-server `http://127.0.0.1:8080/v1` |

---

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `autocorrect.enabled` | `true` | Master switch |
| `autocorrect.disableAutocorrect` | `false` | Stop automatic Enter line fixes; fix on demand only (tutorial 16) |
| `autocorrect.provider` | `groq` | Legacy provider (used if `profiles` empty) |
| `autocorrect.model` | `""` | Model ID (empty = provider default) |
| `autocorrect.baseUrl` | `""` | Legacy openai-compatible URL |
| `autocorrect.profiles` | `[]` | Named LLM endpoints (see tutorial 11) |
| `autocorrect.activeProfile` | `default` | Default profile id |
| `autocorrect.languages` | `["python"]` | Active language IDs |
| `autocorrect.prompt.prefix` | `""` | Global context on every request (tutorial 17) |
| `autocorrect.line.enabled` | `true` | Enter-triggered line fixes |
| `autocorrect.line.requireDiagnostic` | `true` | **Automatic (Enter):** require LSP error before LLM |
| `autocorrect.fix.requireDiagnostic` | `false` | **Deliberate (menu/staged):** require LSP error before LLM |
| `autocorrect.line.contextLines` | `10` | Tier 1: lines above target |
| `autocorrect.line.contextLinesBelow` | `0` | Tier 1: lines below target |
| `autocorrect.line.maxLineChars` | `200` | Max chars per context line |
| `autocorrect.context.tokenBudget` | `0` | Hard context cap (`0` = profile policy) |
| `autocorrect.context.ringEnabled` | `false` | Enable tiers 3–5 |
| `autocorrect.context.defaultTiers` | nearby on | Default tier modifiers in staged mode |
| `autocorrect.timeoutMs` | `0` | `0` = auto (**5s** cloud, **60s** localhost) |
| `autocorrect.line.debounceMs` | `800` | Delay after Enter before check |
| `autocorrect.queue.mode` | `reviewChanges` | **Checkpoint review** vs **deferred batch** (tutorial 13–14). Values: `reviewChanges` \| `deferExecution` |
| `autocorrect.queue.enabled` | `false` | Enter queues instead of applying; uses `queue.mode` (tutorial 15) |
| `autocorrect.debug` | `false` | Verbose output channel logs |

### Supported languages

Default: **python** only. Also built-in (less tested): `go`, `java`, `c`, `cpp`, `rust`, `zig`, `javascript`, `typescript`.

```json
"autocorrect.languages": ["python", "typescript"]
```

---

## Language server setup (VS Code vs Cursor)

The extension reads diagnostics from your editor's LSP — it does not ship one.

### VS Code (Python)

| Step | Action |
| --- | --- |
| Extensions | **Python** + **Pylance** |
| Interpreter | **Python: Select Interpreter** |
| Settings | `"python.languageServer": "Pylance"` |

```json
{
  "python.languageServer": "Pylance",
  "python.analysis.typeCheckingMode": "basic",
  "autocorrect.line.requireDiagnostic": true
}
```

### Cursor (Python)

Use **Anysphere Python** (`anysphere.python`), not Pylance.

```json
{
  "python.languageServer": "Default",
  "cursorpyright.analysis.typeCheckingMode": "all",
  "autocorrect.line.requireDiagnostic": false
}
```

Set `requireDiagnostic` to `true` once **View → Problems** shows errors reliably. With `false`, every Enter on a non-blank line can burn tokens (see tutorial 1).

### Other languages

Add language ID to `autocorrect.languages` and install the language server (rust-analyzer, gopls, etc.).

---

## How it behaves

**Line mode** — Enter only; skips blank/comment lines; may add lines for syntax fixes (e.g. missing `)` on next line).

**Block mode** — Full block replace; line count may grow or shrink.

**Privacy** — Code sent to your chosen provider when a correction runs; keys in secret storage.

**No auto-suggest** — No Tab ghost text or inline prediction.

---

## Troubleshooting

Enable `"autocorrect.debug": true` and open **View → Output → LLM Autocorrect** for skip reasons, diagnostic-gate timing, and LLM call logs.

### Enter / line autocorrect

| Problem | What to check |
| --- | --- |
| **Nothing on Enter** | File must be a real source doc (`.py`, not Output/Settings). Language ID must be in `autocorrect.languages` (default: `python` only). Master switch on (status bar sparkle, not slash). `autocorrect.disableAutocorrect` must be **false** (tutorial 16). `autocorrect.line.enabled` must be **true**. Wait ~`line.debounceMs` (default 800ms) after Enter. Blank and comment-only lines are skipped. |
| **Log says `no LSP squiggle`** | With default `line.requireDiagnostic: true`, Enter only calls the LLM when the language server reports an error/warning on that line. Fix LSP setup (**View → Problems**), or temporarily set `line.requireDiagnostic: false` (higher token use — tutorial 1). On Cursor Python, see [Language server setup](#language-server-setup-vs-code-vs-cursor). |
| **Manual C works, Enter doesn't** | **Automatic** Enter uses `line.requireDiagnostic`; deliberate **C** uses `fix.requireDiagnostic` (default off). If LSP is slow, increase `line.diagnosticWaitMs` (default 1500ms). Or set `line.requireDiagnostic: false`. |
| **`already correct` / no edit** | Model returned the same line or `UNCHANGED`. Normal — no apply, but you may still have paid for the prompt. |
| **Range locked on enqueue** | Overlapping enqueue shows a modal: **Replace**, **Expand & merge** (same profile), **Revert & continue** (if an applied fix overlaps), or **Cancel**. |
| **Remove / revert at cursor** | Command Palette → **Remove or Revert Queued Change at Cursor** — drops a queued item, or reverts a ledger entry if the buffer still matches. |
| **Enter does nothing at all (no log)** | Likely `disableAutocorrect: true` or `line.enabled: false`. Status bar shows `(manual)` when Enter autocorrect is off. |

### Menu, staged mode, and manual fixes

| Problem | What to check |
| --- | --- |
| **Menu keys ignored** | Open the menu first (double-tap **Ctrl**). Keys only work in menu, staged, or Staged Window mode. **Esc** exits menu; staged block needs **Esc** or cancel to clear. |
| **Staged send skipped** | Deliberate gate: `fix.requireDiagnostic: true` requires an LSP squiggle on the block. Default **false** — sends anytime. |
| **`buffer changed — skipped`** | File was edited while the LLM was running. Re-stage and send again. |
| **`select a block for A`** | **A** needs a non-empty selection. Use **Shift+A** to stage without immediate send, or **S** Staged Window. |
| **Docs / caveman odd or skipped** | **D** (documentation) rejects output that alters code lines or invents new classes. **F** (caveman) rejects if line count changes. These modifiers and their validation are **still being refined** for accuracy — expect occasional skips or imperfect comments until prompts and checks improve. Use **X** for tighter instructions; try a different profile or smaller block. |

### Queue, profiles, and API

| Problem | What to check |
| --- | --- |
| **Queue wrong profile** | Profile is chosen during modifiers (**M** / **Shift+M**) before **Shift+E**. **Q** shows the **current** profile's queue only; **Shift+Q** shows all. |
| **Queue empty after review** | Unchecked items in the QuickPick are **discarded**, not left queued. |
| **`413` / token limit (Groq)** | Prompt too large. Disable tiers **3–5**; turn off **1**/**2** if needed; smaller selection; `contextPolicy: minimal`; lower `context.tokenBudget`. |
| **LLM timeout / hung** | Cloud default ~5s; localhost `openai-compatible` default **60s**. Raise profile `timeoutMs` or `autocorrect.timeoutMs`. Confirm llama-server/Ollama is running and `baseUrl` ends with `/v1`. |
| **API key / auth errors** | Command Palette → **Set API Key** per profile. Keys live in secret storage, not `settings.json`. |
| **F5 Extension Development Host** | API keys and settings are per-window — set the key again in the **Extension Development Host**, not only the outer IDE. |

### Settings mix-ups

| Problem | What to check |
| --- | --- |
| **`queue.enabled` vs `disableAutocorrect`** | **`queue.enabled`** — Enter still autocorrects but queues per `queue.mode` (tutorial 15). **`disableAutocorrect`** — Enter does nothing; you fix on demand only (tutorial 16). They solve different problems. |
| **Paste translate never offers** | `autocorrect.paste.enabled` must be true. Only triggers on paste that looks like a *different* language than the file. Never silent — you must accept the prompt. |

---

## Upcoming features

- Broader language testing (Go, Rust, JS/TS, etc.).
- **Docs (D) and caveman (F) modifiers** — prompts and output validation still being refined for more accurate, consistent results.
- **Testing and refining context tiers** — the existing **1**–**5** tiers (nearby lines, signature, recent edits, open tabs, yank) need more real-world tuning; token cost vs accuracy tradeoffs are not settled yet.
- **Context hierarchy and request deduplication** — explore smarter micro-context assembly and collapsing overlapping requests. Surgical line/block fixes may not benefit much from dedup (each target is intentional); file-level context sharing might help efficiency but risks blurring surgical intent. Module- or project-wide context belongs in the **Cursor agent**, not this extension — we need a clear **micro-context** boundary: what stays in autocorrect vs what you delegate upstream.

---

## License

PolyForm Noncommercial 1.0.0 — see [LICENSE](LICENSE).

## Development

`npm install` → `npm run compile` → **F5**. See [CONTRIBUTING.md](CONTRIBUTING.md).
