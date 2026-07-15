# Changelog

All notable user-facing changes to LLM Autocorrect are documented here.

## [Unreleased]

## [0.1.0] - 2026-07-15

First release after **0.0.3** — staged workflow, multi-profile LLM, queue modes, region lock, and revert ledger.

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
- Queue review discards unchecked items (previously only logged).
- Removed capture-mode `Q` toggle — use staged `Shift+E` to enqueue.
- Command palette hides internal key-only commands.
- Op/modifier indicator: filled circle in the line-number gutter and inline before the first staged line.

### Fixed

- Multi-line queued blocks now highlight **every** enqueued line, not just the first.
- Stale `/context` command menu entry updated.

## [0.0.3]

- Block capture, docs/caveman comments, queued fixes, line autocorrect on Enter, paste translation.
- Providers: Groq, Gemini, Anthropic, openai-compatible.
