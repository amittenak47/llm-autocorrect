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

## Scoring

After the last step the harness waits twice `afterEnterMs`, then scores Enter steps against the final document (ignoring trailing whitespace). Exact clean lines are aligned with LCS; unaligned expected lines are paired with remaining actual lines in order, so exact clean matches remain aligned when a fix adds closing-bracket lines. Unmatched added lines still participate in fallback matching and can affect classifications.

Outcomes are `fixed`, `missed` (unchanged typo), `wrongFix`, `keptCorrect`, or `brokeCorrect`. Precision is `fixed / (fixed + wrongFix + brokeCorrect)`; recall is `fixed / (fixed + missed + wrongFix)`, with zero for an empty denominator. Output includes the totals and every outcome except `keptCorrect`.

The full outcomes and the five boolean settings (`prompt.includeDiagnostics`, `prompt.includeNames`, `prompt.examples`, `line.wholeStatement`, `fix.localChecks`) are saved beside the plan as `<plan>.score.json` (replacing `.json`). All five settings default to true; toggle them for A/B runs. Steps without `clean` use `insert` as their baseline; steps with `enter: false` are excluded.
