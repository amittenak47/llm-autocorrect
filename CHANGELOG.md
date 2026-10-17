# Changelog

All notable user-facing changes to LLM Autocorrect are documented here.

## [Unreleased]

## [0.4.0] - 2026-10-16

### Added

- **Syntax check (tree-sitter)** — the extension parses the file itself for Python, JavaScript, TypeScript, Go, Java, Rust and C++ (`autocorrect.syntax.useParser`). Enter fixes start immediately on a parser-detected error instead of waiting for the language server; unfinished code (an open bracket, a missing closer) is ignored. C and Zig rely on the language server; C++ keeps the parser. New dependency: `@vscode/tree-sitter-wasm` (only the needed grammars ship).
- **Logic suggestions** — **Autocorrect: Check for Logic Bugs** reviews the selection, staged block or enclosing function for likely logic bugs (off-by-one, inverted conditions, wrong variable…) and lists them in Problems with an optional **Apply suggestion** quick fix. Never applies anything on its own (`autocorrect.logic.profileId`, `autocorrect.logic.maxIssues`).
- **Better prompts** — line/block fixes now include the language server's (and parser's) error messages, names defined in the file, and (for line fixes only) a few examples; a multi-line statement (open bracket or `\` continuation) is sent whole. Each is a setting: `prompt.includeDiagnostics`, `prompt.includeNames`, `prompt.examples`, `line.wholeStatement`. With `autocorrect.debug: true`, line/staged calls log system and user prompts (up to 3000 characters each) for A/B testing.
- **Local checks before applying** (`fix.localChecks`) — reject a fix that changes string contents (f-string / template placeholders count as code), introduces a name not defined in the file or a builtin, or rewrites most of the line.
- **Undo bad fixes automatically** (`apply.verifyAfterApply`, `apply.verifyWaitMs`) — immediate fixes are checked (queue reviews are excluded). A new nearby error reverts the fix when the error count does not decrease; a fix is kept when the number of errors near it went down. Lines you are typing on while it waits are ignored.
- **Privacy** — `context.excludeGlobs` (`.env`, keys, credentials… never used as context or corrected), secret redaction in context (`privacy.redactSecrets`), and lines that look like they contain a secret are not sent to cloud profiles (`privacy.skipSecretTargetsForCloud`).
- **Profile overrides** — `autocorrect.profiles` now holds only overrides by id (plus custom profiles) and `autocorrect.hiddenProfiles` hides built-ins, so updated defaults reach everyone. Copies seeded by earlier versions are migrated once to just the fields you changed.
- **Harness scoring** — the typing harness reports fixed / missed / wrong / broke-correct counts with precision and recall, and writes `<plan>.score.json` including the settings used.
- Per-language error patterns for TypeScript/JavaScript, Go, Rust, Java, C/C++ and Zig (upstream redirect no longer Python-only).

### Changed

- **Upstream ("previous line") fixes** need evidence: only redirect to a line with a real syntax error, at most 8 lines up; after a no-op on the upstream line the original line is retried; no blind retry of the line above. Same-text requests in flight are deduplicated and recent no-ops are cached.
- Applying a fix over an earlier autocorrect fix supersedes it instead of asking to revert first.
- Endpoint settings (`profiles`, `provider`, `baseUrl`, `model`, `guardian.profileId`) are machine-scoped and restricted in untrusted workspaces; stored API keys are bound to the endpoint they were saved for.
- Soft-applied Guardian rejections go through the same checks as accepted fixes.
- Settings are cached until they change.

### Fixed

- String-literal checks now require exact contents with distinct matches; documentation checks reject code swallowed by inserted docstrings or block comments.
- Whole-statement fixes no longer swallow enclosing block braces in C-family languages; Python dict/set continuations still expand.
- CRLF fixes now record the document's actual line endings so revert succeeds.
- Manual line/block fixes, queued execution, logic review, and selection translation now respect the master switch.
- Diagnostic messages are redacted before prompt formatting; logic review now includes the global prompt prefix.
- Parser-only verification detects replacement errors at new locations, accounting for added/removed lines.
- **Privacy:** with the ring context tiers on, your last selection from any file (including `.env` and key files) and other open files' signatures could be sent to the model provider, and secrets in surrounding code were sent as-is. Sensitive files are now never used as context, secrets in context are redacted, and lines that look like they contain a secret are not sent to cloud profiles (see **Privacy** in the README).
- A line could only be autocorrected once per session (revert ledger never tracked edits).
- Block fixes removed the first line's indentation when the model replied without a code fence.
- Line-fix context labelled lines below the target as "above".
- Queue highlights stayed after Apply/Clear; staged blocks did not follow edits; staged border/op markers vanished immediately.
- Selections ending at column 0 included an extra line; `[::1]`, `0.0.0.0` and `127.x` were not treated as local.
- Truncated model replies (`max_tokens`) were applied.
- A workspace could redirect a stored API key to another server.
- Queue review could apply items that changed while the picker was open; "Expand & merge" in review mode created items Q could not show; single-line deferred tasks lost their op/instruction.
- Docs validation accepted re-indented code; caveman comments broke on CRLF files.
- Multi-cursor Enter, Undo while waiting for diagnostics, and disabling the extension mid-check were not handled.
- Guardian could deadlock when it shared a profile with the fixer; `maxConcurrent` changes needed a reload; `AbortSignal.any` broke VS Code < 1.90.
- Python slices (`nums[::2]`) were offered as C++ translations.

## [0.3.0] - 2026-07-27

### Added

- **Typing harness** — **Autocorrect: Run Typing Harness** replays JSON from `tests/harness/prepare_plan.py` (LeetCode solutions with injected typos / foreign lines). Each step inserts the line, then a separate `\n` so Enter autocorrect fires. See `tests/harness/README.md`.
- README **Recommended model usage** — cloud vs local profiles, Granite 4.1 fixer + Guardian LoRA judge stack, and what *not* to use (FIM autocomplete models, reasoning models on Enter).

### Changed

- **Guardian judge** — stricter yes/no: prefer `no` when unsure; reject style-only churn and fixes that change identifiers or string literals without a minimal typo/syntax repair.
- **Staged context notes** — modifier **X** instructions skip Guardian (deliberate edits, not blind typo fixes).
- **`apply.onReject`** default **`softApply`** — rejected candidates still apply with revert-ledger undo; Enter line fixes still apply if the cursor returns to the line while Guardian/regeneration is pending.

## [0.2.7] - 2026-07-25

### Added

- **Granite Guardian judge** — optional second server scores fix/paste candidates (`autocorrect.guardian.enabled`). On `no`, regenerate once; still rejected → log (and optional `softApply`).
- Built-in **`guardian`** profile (`http://127.0.0.1:8081/v1`) alongside renamed **Granite 4.1 8B** local fixer.
- README: **llama-cli** download + dual `llama-server` serve for fixer/Guardian.

### Changed

- Removed global `autocorrect.llm.reasoningMode` — use per-profile `reasoningMode` only (defaults to `off`).
- Guardian rejects **soft-apply** by default (`apply.onReject`); Enter fixes still apply if the cursor returns to the line while waiting.
- README: **recommended** local setup is Granite 4.1 fixer + **Guardian LoRA** on `:8081` (full Guardian GGUF as fallback).

## [0.2.6] - 2026-07-25

### Fixed

- **Paste-translate fidelity** — stricter translate-only prompt; reject replies that invent unrelated identifiers (e.g. `greet` for a `std::cout` paste). Short foreign one-liners can trigger detection.

## [0.2.5] - 2026-07-25

### Fixed

- **Duplicate Cancel** on modal dialogs (VS Code already adds Cancel when `modal: true`).
- **Revert ledger apply** — only drop a ledger entry after a successful revert; keep it if the buffer no longer matches.
- Clearer Output reasons when apply is cancelled, revert fails, or baseline is stale.
- **Large block expansion** — confirm before applying a fix that more than doubles the staged line count (guards against models pasting context into the block).

### Added

- **Default profiles in settings** — package default for `autocorrect.profiles` is the full set (groq, gemini, anthropic, local, ollama). First activation seeds **User** settings when profiles are unset (not Workspace).

## [0.2.3] - 2026-07-25

### Fixed

- **Cascade redirect** — root diagnostics that *start* on the previous line but span into the Enter line (common for `defn` / `Expected expression`) now redirect upstream before calling the LLM.
- **Enter auto-indent** — model replies that strip leading whitespace reattach the buffer’s indent instead of aborting as `whitespace-only diff`; if the line is still unchanged, retry the previous non-blank line.


### Fixed

- **Upstream line redirect** — when Enter would fix a line that only has cascade diagnostics (for example `return` under a broken `defn`), the extension redirects to the previous line that holds the root syntax error.
- After a whitespace-only model reply (echoed target with different indent), the extension retries that upstream line when applicable.

## [0.2.1] - 2026-07-25

### Added

- **Reasoning controls** — per-profile `reasoningMode` (`off` | `log`) and optional `reasoningEffort`. Fixes always apply from model `content` only; when `log`, reasoning traces go to the Output channel and are never applied.
- **Global fallback** — `autocorrect.llm.reasoningMode` when a profile omits `reasoningMode`.
- **Built-in profiles** — if `autocorrect.profiles` is empty and legacy `provider` / `model` / `baseUrl` are unset, the extension uses: `groq`, `gemini`, `anthropic`, `local` (llama-server), `ollama`.
- **Profile token budgets** — `maxTokensLine` / `maxTokensBlock`. Localhost line fixes default to **2048** output tokens.

### Changed

- Prefer **named profiles** over legacy single-provider settings. Remove `autocorrect.provider` / `baseUrl` / `model` once `profiles` is configured.
- Local OpenAI-compatible requests send `enable_thinking: false` when `reasoningMode` is `off` (including when the model id is `local`).
- Activation log reports extension version and resolved profile ids.

### Fixed

- `autocorrect.debug` no longer dumps reasoning text unless `reasoningMode` is `log`.
- Legacy migrated `"default"` localhost profile no longer forces `reasoningMode: log`.

## [0.2.0] - 2026-07-25

Daily-use reliability and UX polish on the v0.1.0 workflow.

### Added

- **Cursor first-run prompt** — offers to set `line.requireDiagnostic: false` when Anysphere diagnostics would block Enter.
- **Persistent mode key hint** on the status bar (menu / staged / capture) until Esc; click opens the command menu while in a mode.
- **Reject recovery** for docs/caveman — Output shows model text; picker offers Copy / Force apply.
- **Context settings** — `context.nearbyMode` (`indentScope` default), `context.signatureDepth` (`chain` default).

### Changed

- Queue review: **unchecked items stay queued** (no longer discarded).
- Longer queue previews (~120 chars).
- Default `contextLinesBelow` is **2**; default tiers include **signature**.
- Nearby context is **indent-scoped** by default; signature is a short enclosing chain.
- Caveman applies via **comment-suffix merge** (original code preserved).
- Enter skip for missing LSP now surfaces on the status bar.
- Line fixes no longer double-send nearby context.

### Fixed

- Signature tier works on the line-fix path (no longer required a TextEditor handle).
- Fence stripping accepts prose-wrapped model replies.

## [0.1.0] - 2026-07-15

First public release after **0.0.3** — staged workflow, multi-profile LLM, queue modes, region lock, and revert ledger. (Some in-repo release commits during development referred to this batch as 0.2.0 before the publish version was finalized as 0.1.0.)

### Added

- **Modal menu** — `Ctrl+Shift+;` or double-tap `Ctrl` opens hotkey menu mode.
- **Staged workflow** — `Shift+A` / `Shift+C` or capture (`S` → WASD → `E`) stages a block; set flags then submit.
  - `D` docs · `F` caveman · `X` context note · `1`–`5` context tiers · `M` LLM profile
  - `E` send now · `Shift+E` enqueue · `A`/`C` still instant-fix shortcuts
- **Context tiers** (staged mode keys `1`–`5`) — optional nearby lines, signature, recent edits, open tabs, yank buffer.
- **Multi-profile LLM** — configure `autocorrect.profiles` with named endpoints (Groq, local llama-server, etc.).
  - `M` cycles profile · `Shift+M` picks from list
  - Per-profile queues · `Q` reviews active profile · `Shift+Q` reviews all
- **`autocorrect.queue.mode`** — **Checkpoint review** (`reviewChanges`) vs **deferred batch** (`deferExecution`). Mutually exclusive binding.
- **Per-profile concurrency** — `maxConcurrent` on each profile (default 1 localhost, 2 cloud).
- **`autocorrect.disableAutocorrect`** — turn off Enter-triggered line fixes while keeping manual/staged fixes and queue review.
- **Region lock** — overlapping enqueue prompts (**Replace** / **Expand & merge** / **Revert & continue** / **Cancel**); queue border color = LLM profile.
- **Revert ledger** — per-change revert via **Remove or Revert Queued Change at Cursor**; anchor + baseline hash for apply after line shifts.
- **Global prompt prefix** — `autocorrect.prompt.prefix` prepended to every LLM request.
- **Diagnostic gates** — separate settings for Enter vs manual fixes:
  - `autocorrect.line.requireDiagnostic` (Enter, default on)
  - `autocorrect.fix.requireDiagnostic` (menu/staged, default off)
- **Local inference** — `openai-compatible` provider for Ollama / llama-server; localhost defaults to **60s** timeout.
- **Response ingress** — multi-line LLM output kept for line fixes; blocks support line-count changes.
- **In-editor indicators** — staged block (green), profile-colored queue highlights, modifier gutter dot, tier marks.
- **CHANGELOG.md** (this file).

### Changed

- Queue items store **op**, **context note**, and **profile**; review picker shows them.
- Queue review discards unchecked items (superseded in 0.2.0 — unchecked items now stay queued).
- Removed capture-mode `Q` toggle — use staged `Shift+E` to enqueue.
- Command palette hides internal key-only commands.
- Op/modifier indicator: filled circle in the line-number gutter and inline before the first staged line.

### Fixed

- Multi-line queued blocks now highlight **every** enqueued line, not just the first.
- Stale `/context` command menu entry updated.

## [0.0.3]

- Block capture, docs/caveman comments, queued fixes, line autocorrect on Enter, paste translation.
- Providers: Groq, Gemini, Anthropic, openai-compatible.
