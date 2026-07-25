# Changelog

All notable user-facing changes to LLM Autocorrect are documented here.

## [Unreleased]

### Added

- **Reasoning mode** — per-profile `reasoningMode` (`off` | `log`) and `reasoningEffort` for Groq, Anthropic, Gemini, and local OpenAI-compatible servers. Reasoning is logged to Output when enabled; fixes always apply from `content` only.
- **Built-in default profiles** — when `autocorrect.profiles` is empty: `groq`, `gemini`, `anthropic`, `local` (llama-server), `ollama`.
- **Profile token budgets** — `maxTokensLine` / `maxTokensBlock` (localhost default 1024 line / 2048 block floor).

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
