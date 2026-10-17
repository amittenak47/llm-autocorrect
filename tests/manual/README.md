# Manual tests for v0.4.0

These files are test DATA, with intentional typos, syntax errors, and logic bugs.
Use the installed v0.4.0 extension in VS Code. Do not run the broken fixtures as programs.
Python's valid-code fixtures use Python 3.10+ (match/case).

Open Output → "LLM Autocorrect". It shows every step with `autocorrect.debug: true`.
Start the local inference server yourself; selecting `local` does not start it.
Use this block inside VS Code **User** settings JSON:

```jsonc
"autocorrect.activeProfile": "local",
"autocorrect.debug": true,
"autocorrect.languages": ["python", "javascript", "typescript", "go", "rust", "java", "c", "cpp"],
"autocorrect.line.requireDiagnostic": true
```

Keep `enabled` and `line.enabled` true, `disableAutocorrect` false, `queue.enabled`
false, and `fix.requireDiagnostic` false for the initial pass. Use one cursor.
Restore changed settings between A/B runs. Model output varies: the comments
describe the desired repair, not a promise that every model produces it.

## Exact trigger instructions

- **Enter fix:** put the cursor at the END of a broken line and press Enter. The extension checks the line just left.
  Comment lines and blank lines are skipped, so expectations are comments ABOVE the target, never on the broken line itself.
- **Manual line fix:** menu (Ctrl double-tap / Ctrl+Shift+;, or Cmd double-tap / Cmd+Shift+; on macOS) then C, or the command "Autocorrect: Correct Line Near Cursor".
- **Block fix / docs / caveman / instruction:** select lines, menu → Shift+A to stage, then E (fix), D then E (docs), F then E (caveman), X (type an instruction) then E.
- **Logic review:** cursor inside a function → "Autocorrect: Check for Logic Bugs"; results appear in Problems.
- **Paste translate:** copy a snippet, paste it into a `.py` file.
- Output → "LLM Autocorrect" shows every step (set `autocorrect.debug: true`).

Copy just one case (including its function, imports, and defined names) into a fresh
scratch file under `tests/manual/` with the same extension before testing. For
Java, keep the `Typos` class wrapper; keep includes/imports for the other languages.
This prevents unrelated syntax errors and open brackets elsewhere in a fixture
from swallowing the target or contaminating diagnostics. For the privacy test,
keep its whole file and filename. For CRLF, work in the CRLF file itself.
Undo edits between trials; do not undo while a request is pending except in the
explicit cancellation trial. Wait for the spinner and verification window to end.

The parser detects **syntax**, not unresolved identifiers or method names. For
`pritn`, `fmt.Pritnln`, and similar balanced lines, use an LSP squiggle or set
`line.requireDiagnostic: false` for Enter; manual C also works with its default gate
off. Go and Java have no language server installed in this VS Code, so only the
parser path works there with the gate on. C and Zig have no built-in parser. C trials rely on the C/C++ language server (cpptools is installed); C++ keeps the parser.
rust-analyzer gives limited diagnostics for a lone `.rs` outside a Cargo project.
With the gate off, correct nonblank lines can also cost an LLM call.

## Checklist

| Done | File | Feature | Steps | What to look for |
| --- | --- | --- | --- | --- |
| [ ] | [python/01_enter_typos.py](python/01_enter_typos.py) | 28 line repairs, names, diagnostics, examples, whole statement | Isolate each case; Enter at END of target; try manual C too | Spinner, brief fix highlight; minimal repair; `[line] diagnostic gate: parser found a syntax error` for eligible syntax errors; unchanged string contents and indentation |
| [ ] | [python/02_upstream.py](python/02_upstream.py) | Upstream evidence, unrelated error, no-op cache, unfinished code | Follow a–e; Enter on BODY for a/b | `[line] redirecting fix from line`; header fixed, body untouched; unrelated import untouched; d has one call with gate off; e adds nothing |
| [ ] | [python/03_should_not_change.py](python/03_should_not_change.py) | Literal/name/style preservation | Enter with gate off or manual C; repeat promptly | `UNCHANGED`, cached no-op, or `[line] local check rejected (changed string literal)` if model changes literal contents |
| [ ] | [python/04_blocks.py](python/04_blocks.py) | A, staging, docs, caveman, instruction, indentation | Select each function; follow its steps; try selection ending at column 0 of next line | Green staged lines, persistent hints, modifier dot and token estimate; code/comments as described; first indentation and extra unselected line preserved |
| [ ] | [python/05_logic_bugs.py](python/05_logic_bugs.py) | Eight logic bugs and two controls | Cursor inside one function → logic review; also try selection/staged scope | `[logic]`, Problems source `autocorrect (logic)`; no automatic edit; optional Apply suggestion / Dismiss; controls: `no logic issues found` |
| [ ] | [python/06_crlf.py](python/06_crlf.py) | Docs/caveman CRLF regression and revert | Separate functions: stage → D/E or F/E, then Remove or Revert Queued Change at Cursor | VS Code bottom-right still CRLF; original code/indent retained; no stray line breaks in caveman comments; revert restores the original |
| [ ] | [paste_snippets.md](paste_snippets.md) | Five foreign languages and Python slices | Copy code only into a fresh `.py`; accept once, dismiss once | Convert-to-Python offer for foreign code; never silently replaced; faithful program; slices have no offer |
| [ ] | [privacy/secrets_context.py](privacy/secrets_context.py) | Context redaction, cloud target skip vs local | Keep nearby secrets; Enter/C on typo; switch active profile for secret-bearing target | `[privacy] redacted N secret(s) from context`; target skip status `text looks like it contains a secret (cloud profile)`; local repair works |
| [ ] | [privacy/.env.sample](privacy/.env.sample) | Excluded document | Enter; try C/block and using file as context | No request; status `file matches autocorrect.context.excludeGlobs`; excluded even if language changed to Python |
| [ ] | [js/typos.js](js/typos.js) | JavaScript, upstream, unfinished brace | Isolate 10 cases, follow Enter/body notes | Minimal repairs; parser gate vs identifier gate; upstream log; no invented `}` |
| [ ] | [ts/typos.ts](ts/typos.ts) | TypeScript, upstream, unfinished brace | Same; this file must never be compiled by project tsc | Same; type syntax repaired without removing types |
| [ ] | [go/typos.go](go/typos.go) | Go parser path, upstream, unfinished brace | Gate on for syntax, off for name typos and upstream trial; isolate cases | Parser log without gopls; correct `fmt.Println`; no invented `}` |
| [ ] | [rust/typos.rs](rust/typos.rs) | Rust parser path, upstream, unfinished brace | Isolate cases; gate off/manual C for macro/name typos | `println!`, preserved Rust syntax; no invented `}` |
| [ ] | [java/Typos.java](java/Typos.java) | Java parser path, upstream, unfinished brace | Keep class wrapper; gate off/manual C for `Sytem` | Missing semicolons repaired; parser without Java LSP; no invented `}` |
| [ ] | [cpp/typos.cpp](cpp/typos.cpp) | C++, upstream, unfinished brace | Keep includes; isolate cases | `std::cout`, semicolons; upstream; no invented `}` |
| [ ] | [c/typos.c](c/typos.c) | C language-server path, upstream, unfinished brace | Keep include; isolate cases; wait for cpptools diagnostics | `printf`, semicolons; upstream requires LSP evidence; unfinished-header calls depend on LSP diagnostics, with no parser suppression |
| [ ] | [../harness/leetcode_more.jsonl](../harness/leetcode_more.jsonl), [../harness/plan_more.json](../harness/plan_more.json) | Larger typing/scoring run | Run Larger plan below, then A/B settings | `[harness]` counts/precision/recall, `.score.json` with settings; clean lines stay correct |

With `autocorrect.debug: true`, compare `[line] prompt (user):` for TARGET,
names and diagnostics, and `[line] prompt (system):` for examples. Staged calls
use `[staged] prompt (user):` and `[staged] prompt (system):`. Each prompt is
truncated to 3000 characters; use a small isolated case so the relevant section is
visible. Turn debug off after testing; prompts can contain code.

## Each new 0.4.0 setting: defaults and A/B trials

All names below have the `autocorrect.` prefix. Change one at a time in User settings.

| Setting | Default | A/B trial |
| --- | --- | --- |
| `syntax.useParser` | `true` | Toggle false for missing-colon/semicolon cases with no LSP; only true provides the parser gate. |
| `logic.profileId` | `""` (active profile) | Compare active profile vs `"local"` or another configured reviewer; confirm review route in Output. |
| `logic.maxIssues` | `5` | Select all eight buggy functions; compare 5 vs 1; reported count must respect the cap. |
| `prompt.includeDiagnostics` | `true` | Toggle false for syntax cases; compare the diagnostic section in `[line] prompt (user):` (or `[staged] prompt (user):` for blocks) and harness score. |
| `prompt.includeNames` | `true` | Toggle false for `totl` / `{reslt}`; compare available names in `[line] prompt (user):` and repair quality. |
| `prompt.examples` | `true` | Toggle false; compare the examples in `[line] prompt (system):` and harness score (line fixes only). |
| `line.wholeStatement` | `true` | Toggle false for case 23 in 01; compare TARGET in `[line] prompt (user):` and handling of both call lines. With true, Python dict/set braces expand; enclosing braces in JS/TS/Go/Rust/Java/C/C++ do not. |
| `fix.localChecks` | `true` | Compare true/false on valid strings/custom names in 03; if a candidate changes literals, true logs `[line] local check rejected`. False does not guarantee a model change. |
| `apply.verifyAfterApply` | `true` | Compare true/false on immediate fixes; monitor after-apply checks. A bad candidate introducing a new nearby error without reducing the error count should log `[verify] reverted fix` with true. Queued review applies are excluded. |
| `apply.verifyWaitMs` | `2000` | Compare 2000 vs 4000 for slow diagnostics; leave target still while waiting. |
| `context.excludeGlobs` | Array below | Keep defaults, then append `"**/tests/manual/python/03_should_not_change.py"`: that file should skip even manual fixes/context. Remove added glob afterward. |
| `privacy.redactSecrets` | `true` | In fake-only secrets fixture, compare true/false; true emits `[privacy]` when selected context contains a recognized fake value. |
| `privacy.skipSecretTargetsForCloud` | `true` | Compare local vs configured cloud with true, then false using fake-only target: true skips cloud, false allows request. |
| `profiles` | `[]` | Changed semantics: set `[{"id":"local","timeoutMs":65000}]`; other local fields inherit built-in defaults. Restore afterward. |
| `hiddenProfiles` | `[]` | Set `["gemini"]`; staged Shift+M should hide it, while M cycles visible profiles. Restore `[]`; hiding all restores built-ins. |

Default `autocorrect.context.excludeGlobs`:

```json
["**/.env", "**/.env.*", "**/*.pem", "**/*.key", "**/id_rsa*", "**/id_ed25519*", "**/*.p12", "**/*.pfx", "**/secrets.*", "**/*secret*.json", "**/credentials*", "**/.aws/**", "**/.ssh/**", "**/.npmrc", "**/.pypirc", "**/*.kdbx"]
```

Privacy, endpoint and hidden-profile settings are machine-scoped; use User settings.
`profiles` is now an overrides array. Seeded profile migration is a one-time upgrade
check: already-migrated v0.4.0 settings will not migrate again on every test.

## Additional workflow and regression passes

Reuse 01/03/04 and fresh copies; restore settings between passes.

| Feature | What to do | What should happen |
| --- | --- | --- |
| Blank/comment skip | Enter on a blank line and on an expectation comment in 01 | No LLM call, even with the diagnostic gate off. |
| Manual-only / enable switches | Set `disableAutocorrect: true`; Enter, then menu C; also try master off and `line.enabled: false` separately | `(manual)` status for manual-only; Enter silent; C still works for manual-only/line off; with master off try C/A, staged E, deferred Q, logic review and Translate Selection: no LLM call, status `Autocorrect is off — click the status bar item to turn it on`. |
| Manual diagnostic gate | Set `fix.requireDiagnostic: true`, select correct function in 04; compare false | True needs diagnostics; false permits deliberate send. |
| Capture / cancel / single-line stage | Menu → S; W/S and A/D size; E stages, Esc cancels. Try Shift+C → E | No LLM on first capture E; green markers persist until send/cancel; single-line stage works. |
| Context tiers | Stage 04, toggle 1/2; set `context.ringEnabled: true`, edit another function, open 03, select a large snippet, toggle 3/4/5 | Status tiers/token estimate and Output reflect included context; 3–5 require ring enabled. Compare `nearbyMode: "window"` vs default `"indentScope"`, `signatureDepth: "header"` vs `"chain"`. |
| Global prefix | Temporarily set `prompt.prefix: "Preserve variable names."`, stage X `add type hints` | Both notes included in `[staged] prompt (user):`; X applies to this request only. Also run logic review with a visible output constraint in the prefix and check the result. Restore prefix. |
| Profiles / reasoning / concurrency | M/Shift+M before sends; two separate staged sends on configured profiles; optionally profile `reasoningMode: "log"` vs `"off"`, `maxConcurrent: 1` vs 2 | Chosen profile in status/Output; independent in-flight caps; reasoning only in Output, never applied. Requires suitable running endpoints. |
| Checkpoint queue | `queue.mode: "reviewChanges"`; stage two disjoint blocks in 04 → Shift+E; Q current profile / Shift+Q all | LLM runs on enqueue; amber proposed edits, profile-colored border, count; check one only: apply it, keep unchecked. Esc preserves queue. Apply All applies checkpoint edits; Clear removes highlights. |
| Deferred queue | `queue.mode: "deferExecution"`; enqueue docs and a single-line X instruction | Blue dotted task; no LLM until Q; queued op/instruction preserved; checked tasks run and apply, unchecked stay. |
| Enter queue | `queue.enabled: true`; Enter on 01 typo in each queue mode | Queue behavior matches mode; manual C/staged E still immediate. Restore false. |
| Checkpoint overlap / stale queue | Set `queue.mode: "reviewChanges"`; enqueue overlapping blocks in 04; try Replace and Cancel separately. Edit queued text while review picker open, then select Apply | Replace is the only overlap action besides Cancel; no Expand & merge. Replacement stays reviewable; stale text must not overwrite your edit. |
| Deferred overlap | Set `queue.mode: "deferExecution"`; enqueue overlapping blocks on the same profile; try Replace / Expand & merge / Cancel separately | Expand & merge is available only here; merged task runs on Q with the combined range. |
| Moving staged/queued ranges | Stage a function in 04, insert a line above it, then send; repeat with a queued block | Green staged markers and later queued anchors follow line shifts; modifier/profile markers remain visible; only intended code changes. |
| Revert / supersede | Apply repair; run Remove or Revert Queued Change at Cursor; repeat, then edit that line to a new typo and fix again | Revert restores original if baseline still matches; second correction works and supersedes earlier ledger entry. Clear queue leaves no markers. |
| Undo / disable while pending | Trigger Enter, immediately Undo or turn extension off; re-enable after request settles | Stale request must not apply; no late edit to undone/disabled buffer. |
| Multi-cursor Enter | On fresh 01 copies, place two cursors at ends of two typo lines, Enter | No wrong-line overwrite; inspect Output and both target lines; unrelated code unchanged. |
| Local validation / verification | On 03, observe any rejected style/literal rewrite; on 01, observe verifier after valid repair and any bad candidate | Local rejection preserves buffer; verifier does not revert successful repair. `[verify] reverted fix` requires an actual bad candidate, so cannot be forced reliably with static data alone. Moving/typing on checked lines may suppress verification. |
| Docs/caveman rejects | Stage 04 for docs/F; if model alters code, inspect recovery picker | Validation/recovery offers Copy model text / Force apply; record rejection before choosing either. |
| Guardian (optional) | Configure running judge, enable `guardian.enabled`, repeat 01/04 with `apply.onReject` softApply then skip | `[guardian]` score/retry; soft-applied candidates still face local/after-apply checks; staged X instructions skip judge. Cloud judge skips secret-bearing originals. |
| Truncated replies (optional) | Temporarily lower local profile `maxTokensLine`, retry longer target | Truncated reply must not apply; inspect Output reason; restore token budget. |
| Endpoint scope / key binding (optional) | Inspect User vs Workspace settings for `profiles`, legacy endpoint fields, and `guardian.profileId`; try a disposable custom cloud profile with an allowed fake key saved through Set API Key, then change its endpoint | Endpoint fields are machine-scoped/restricted in untrusted workspaces; workspace cannot redirect a saved key; changed endpoint requires saving a key again. Keep fake keys in secret storage, never settings or fixtures. Restore the disposable override. |
| Translate command | Select foreign snippet in `.py` → Autocorrect: Translate Selection | Same faithful translation behavior; paste offers can be dismissed without replacing text. |
| Logic lifecycle | Review via cursor, then selection, then staged block; dismiss one suggestion, clear all, review again and edit flagged line | Correct scope, no auto edits; optional single-line Apply suggestion; Dismiss/Clear work; stale suggestions disappear on edit. |

No UI regression is proven by these data files alone. Record the model/profile,
settings, target, status text, and relevant Output for any mismatch. A transient
model no-op may be cached; use a fresh scratch URI for an independent trial.

## Larger plan

The 12 correct solutions in `tests/harness/leetcode_more.jsonl` generate the seeded
`tests/harness/plan_more.json` (4000 ms after Enter, seed 7). To regenerate:

```powershell
python tests/harness/prepare_plan.py --dataset tests/harness/leetcode_more.jsonl -o tests/harness/plan_more.json --after-enter-ms 4000 --seed 7
```

Create/focus an empty `tests/manual/harness_scratch.py`, set
`autocorrect.line.requireDiagnostic: false`, then run **Autocorrect: Run Typing Harness**
and choose `tests/harness/plan_more.json`. The command types into the active editor
at the cursor; use only that empty scratch file. Watch `[harness]`
fixed/missed/wrongFix/brokeCorrect counts and precision/recall in Output. The report
appears beside the plan as
`tests/harness/plan_more.score.json`, with the five
prompt/whole-statement/local-check booleans recorded. Reset the scratch and archive
the score under `tests/harness/` before an A/B run, because the next run overwrites
that score. Roughly 15–20 minutes plus model latency; increase the delay if local
inference exceeds 4 seconds. Restore the diagnostic gate afterward.

## Known limits

- **Missing closers vs. unfinished code.** The parser deliberately ignores errors on a line that leaves a bracket
  open (`function f() {`, `items = [1, 2,`) so Enter never closes a block you are still writing. A genuinely
  missing `)` on such a line is therefore only caught through the language server (gate on) or manual C.
- **Case 23** (two-line call, missing comma on the second line) needs both the comma and the closing bracket; its
  expectation lists both. A balanced control is in its notes.
- **02(d)** makes one LLM call only with the diagnostic gate off; with the gate on and no diagnostic, zero calls is
  correct.
- **Upstream redirect.** When the parser error on a broken header spans into the body line, the redirect happens
  before the first call. If Output instead shows a no-op on the body followed by `[line] retrying upstream line`,
  the header was still fixed, with one extra call — note it, but it is not a failure.
- **Brace-language headers (with parser support)** with an unbalanced bracket (`function add(a, b {`) are treated as unfinished code by the
  parser. JS/TS still get them from the language server; Go and Java (no language server installed here) do not, so
  those upstream trials use explicit declaration errors and gate-off steps.

- **Whole-statement / upstream spans.** In JS, TS, Go, Rust, Java, C and C++, a body
  line's TARGET excludes enclosing braces. Open parentheses/brackets still include
  their opening lines. JS/TS/Go/Rust/C++ upstream declarations have parser evidence
  for a retry after a body no-op (or an LSP redirect); Java's missing-semicolon error
  spans the return and redirects directly using the parser. C needs cpptools
  evidence, and without it there is no upstream retry. Python upstream a/b still
  redirect from body to header; case 23 still sends both call lines, and Python
  dict/set braces remain continuations.
