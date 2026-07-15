# Changelog

All notable user-facing changes to LLM Autocorrect are documented here.

## [Unreleased]

### Added

- **`autocorrect.disableAutocorrect`** — turn off Enter-triggered line fixes while keeping manual fixes, staged **Shift+E** enqueue, and queue review.

## [0.2.0] - 2026-07-15

### Added

- **Modal menu** — `Ctrl+Shift+;` or double-tap `Ctrl` opens hotkey menu mode.
- **Staged workflow** — `Shift+A` / `Shift+C` or capture (`S` → WASD → `E`) stages a block; set flags then submit.
  - `D` docs · `F` caveman · `X` context note · `1`–`5` context tiers · `M` LLM profile
  - `E` send now · `Shift+E` enqueue · `A`/`C` still instant-fix shortcuts
- **Context tiers** (staged mode keys `1`–`5`) — optional nearby lines, signature, recent edits, open tabs, yank buffer.
- **Multi-profile LLM** — configure `autocorrect.profiles` with named endpoints (Groq, local llama-server, etc.).
  - `M` cycles profile · `Shift+M` picks from list
  - Per-profile queues · `Q` reviews active profile · `Shift+Q` reviews all
- **Global prompt prefix** — `autocorrect.prompt.prefix` prepended to every LLM request.
- **Diagnostic gates** — separate settings for Enter vs manual fixes:
  - `autocorrect.line.requireDiagnostic` (Enter, default on)
  - `autocorrect.fix.requireDiagnostic` (menu/staged, default off)
- **Local inference** — `openai-compatible` provider for Ollama / llama-server; localhost defaults to **60s** timeout.
- **Response ingress** — multi-line LLM output kept for line fixes; blocks support line-count changes.
- **In-editor indicators** — staged block (green), queued fixes (amber per line), profile border, tier gutter marks.
- **CHANGELOG.md** (this file).

### Changed

- Queue items store **op**, **context note**, and **profile**; review picker shows them.
- Queue review discards unchecked items (previously only logged).
- Removed capture-mode `Q` toggle — use staged `Shift+E` to enqueue.
- Command palette hides internal key-only commands.

### Fixed

- Multi-line queued blocks now highlight **every** enqueued line (amber), not just the first.
- Stale `/context` command menu entry updated.

## [0.1.0] - 2026-03

- Block capture, docs/caveman comments, queued fixes, line autocorrect on Enter, paste translation.
- Providers: Groq, Gemini, Anthropic, openai-compatible.
