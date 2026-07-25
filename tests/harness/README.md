# Typing harness

Simulates typing LeetCode solutions with typos / language mistakes, pressing **Enter** after each line so line autocorrect fires.

## Quick start (sample)

```bat
python tests\harness\prepare_plan.py --sample -o tests\harness\plan.json --after-enter-ms 4000
```

1. Rebuild / reload the extension.
2. Open `tests/harness/scratch.py` (focus that editor).
3. Ensure `autocorrect.line.requireDiagnostic` is **false** for this smoke test (typos may not get LSP squiggles).
4. Command Palette → **Autocorrect: Run Typing Harness** → pick `tests/harness/plan.json`.
5. Watch **Output → LLM Autocorrect** for `[harness]` / `[line]` / `[guardian]` while it types.

Cancel via the progress notification **Cancel** button.

## Your dataset

```bat
python tests\harness\prepare_plan.py --dataset PATH\to\solutions.jsonl -o tests\harness\plan.json --limit 10
```

Supported `--dataset` shapes:

| Input | Code field |
| --- | --- |
| `.jsonl` / `.json` array | `code`, `python`, `solution`, `src`, or `solutions.python` |
| Directory | all `**/*.py` |
| Single `.py` | whole file |

Useful flags: `--error-rate 0.55`, `--foreign-rate 0.08` (C++/JS/Java lines in a Python file), `--seed 42`, `--after-enter-ms 5000` (local Granite), `--char-delay-ms 15` (slower typing).

## How Enter is simulated

Each step does **two** edits: insert the (possibly corrupted) line, then insert a bare `\n`. That matches `lineCorrector`’s Enter detector (`change.text` starting with newline). A single `line\n` edit would **not** trigger autocorrect.
