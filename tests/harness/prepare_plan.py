#!/usr/bin/env python3
"""
Build a typing plan for Autocorrect: Run Typing Harness.

Loads LeetCode-style solutions from JSON/JSONL/a .py file/a directory of .py files,
injects typos + cross-language mistakes, and writes a plan JSON the extension replays
as: type line → separate newline (so Enter autocorrect fires).

Examples:
  python tests/harness/prepare_plan.py --dataset path/to/solutions.jsonl -o tests/harness/plan.json
  python tests/harness/prepare_plan.py --dataset path/to/py_solutions/ --limit 5 -o plan.json
  python tests/harness/prepare_plan.py --sample -o tests/harness/plan.json
"""

from __future__ import annotations

import argparse
import json
import random
import re
from pathlib import Path
from typing import Any, Iterable

# Keyboard-ish typos for Python / common identifiers
TYPO_MAP = {
    "print": "pritn",
    "def ": "defn ",
    "class ": "clas ",
    "return ": "retrun ",
    "True": "Treu",
    "False": "Flase",
    "None": "Nnoe",
    "len(": "eln(",
    "range(": "rnage(",
    "append": "apend",
    "self": "sefl",
    "elif ": "elseif ",  # language mistake
    "and ": "&& ",  # C-ish
    "or ": "|| ",
}

FOREIGN_LINE_POOL = [
    'std::cout << "hi" << std::endl;',
    'console.log("debug");',
    'System.out.println("x");',
    "let mut x = 0;",
    "fmt.Println(ans)",
]


def load_codes(path: Path) -> list[tuple[str, str]]:
    """Return list of (label, source_code)."""
    if path.is_dir():
        out: list[tuple[str, str]] = []
        for p in sorted(path.glob("**/*.py")):
            out.append((p.name, p.read_text(encoding="utf-8", errors="replace")))
        return out

    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() == ".py":
        return [(path.name, text)]

    if path.suffix.lower() == ".jsonl":
        items = []
        for i, line in enumerate(text.splitlines()):
            line = line.strip()
            if not line:
                continue
            items.append(json.loads(line))
        return extract_from_objects(items, path.name)

    data = json.loads(text)
    if isinstance(data, list):
        return extract_from_objects(data, path.name)
    if isinstance(data, dict):
        return extract_from_objects([data], path.name)
    raise SystemExit(f"Unsupported dataset shape in {path}")


def extract_code_field(obj: dict[str, Any]) -> str | None:
    for key in ("code", "python", "solution", "src", "content", "answer"):
        v = obj.get(key)
        if isinstance(v, str) and v.strip():
            return v
    sols = obj.get("solutions")
    if isinstance(sols, dict):
        for k in ("python", "python3", "Python", "py"):
            v = sols.get(k)
            if isinstance(v, str) and v.strip():
                return v
    return None


def extract_from_objects(items: list[Any], prefix: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for i, obj in enumerate(items):
        if isinstance(obj, str):
            out.append((f"{prefix}:{i}", obj))
            continue
        if not isinstance(obj, dict):
            continue
        code = extract_code_field(obj)
        if not code:
            continue
        label = str(obj.get("id") or obj.get("title") or obj.get("slug") or f"{prefix}:{i}")
        out.append((label, code))
    return out


def corrupt_line(line: str, rng: random.Random, foreign_rate: float) -> str:
    if not line.strip() or line.lstrip().startswith("#"):
        return line

    if rng.random() < foreign_rate and line.strip():
        indent = re.match(r"^\s*", line).group(0)  # type: ignore[union-attr]
        return indent + rng.choice(FOREIGN_LINE_POOL)

    # Prefer whole-token typos
    for src, dst in TYPO_MAP.items():
        if src in line and rng.random() < 0.45:
            line = line.replace(src, dst, 1)
            break
    else:
        # Random adjacent transposition in a word
        words = re.findall(r"[A-Za-z_]{4,}", line)
        if words and rng.random() < 0.5:
            w = rng.choice(words)
            if len(w) >= 4:
                i = rng.randint(1, len(w) - 2)
                messed = w[:i] + w[i + 1] + w[i] + w[i + 2 :]
                line = line.replace(w, messed, 1)
        elif line.rstrip().endswith(")") and rng.random() < 0.3:
            line = line.rstrip()[:-1]  # drop closing paren
        elif rng.random() < 0.2:
            line = line.rstrip() + "f;"  # trailing garbage

    return line


def lines_to_steps(code: str, rng: random.Random, error_rate: float, foreign_rate: float) -> list[dict]:
    steps: list[dict] = []
    for raw in code.replace("\r\n", "\n").split("\n"):
        line = raw
        if line.strip() and rng.random() < error_rate:
            line = corrupt_line(line, rng, foreign_rate)
        # Last empty trailing line of file: still emit enter to flush previous
        steps.append({"insert": line, "enter": True, "clean": raw})
    return steps


def build_plan(
    codes: Iterable[tuple[str, str]],
    *,
    limit: int | None,
    seed: int,
    error_rate: float,
    foreign_rate: float,
    after_enter_ms: int,
    char_delay_ms: int,
) -> dict:
    rng = random.Random(seed)
    solutions = list(codes)
    if limit is not None:
        solutions = solutions[:limit]

    steps: list[dict] = []
    meta: list[dict] = []
    for label, code in solutions:
        start = len(steps)
        chunk = lines_to_steps(code, rng, error_rate, foreign_rate)
        # Separator comment between problems
        steps.append(
            {
                "insert": f"# --- harness: {label} ---",
                "enter": True,
                "clean": f"# --- harness: {label} ---",
            }
        )
        steps.extend(chunk)
        steps.append({"insert": "", "enter": True, "clean": ""})
        meta.append({"label": label, "stepStart": start, "stepCount": len(chunk) + 2})

    return {
        "version": 1,
        "languageId": "python",
        "charDelayMs": char_delay_ms,
        "afterEnterMs": after_enter_ms,
        "seed": seed,
        "errorRate": error_rate,
        "foreignRate": foreign_rate,
        "solutions": meta,
        "steps": steps,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dataset", type=Path, help="JSON / JSONL / .py / directory of .py")
    ap.add_argument("--sample", action="store_true", help="Use built-in tiny sample instead of --dataset")
    ap.add_argument("-o", "--output", type=Path, required=True, help="Plan JSON path")
    ap.add_argument("--limit", type=int, default=None, help="Max solutions to include")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--error-rate", type=float, default=0.55, help="Per-line chance to corrupt (0-1)")
    ap.add_argument("--foreign-rate", type=float, default=0.08, help="Among corruptions, chance of foreign-language line")
    ap.add_argument(
        "--after-enter-ms",
        type=int,
        default=3500,
        help="Pause after each Enter so debounce + local LLM can run",
    )
    ap.add_argument("--char-delay-ms", type=int, default=0, help="Optional delay between characters (0 = whole line)")
    args = ap.parse_args()

    if args.sample:
        sample = Path(__file__).with_name("sample_leetcode.jsonl")
        codes = load_codes(sample)
    elif args.dataset:
        codes = load_codes(args.dataset.expanduser().resolve())
    else:
        ap.error("Provide --dataset PATH or --sample")

    if not codes:
        raise SystemExit("No solutions found — expected code/python/solution fields or .py files")

    plan = build_plan(
        codes,
        limit=args.limit,
        seed=args.seed,
        error_rate=args.error_rate,
        foreign_rate=args.foreign_rate,
        after_enter_ms=args.after_enter_ms,
        char_delay_ms=args.char_delay_ms,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output} ({len(plan['steps'])} steps, {len(plan['solutions'])} solutions)")


if __name__ == "__main__":
    main()
