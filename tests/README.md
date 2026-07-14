# Tests

## Manual (extension host)

1. Press **F5** in the project window.
2. In the **Extension Development Host**, open `tests/python_line_autocorrect.py`.
3. Run **`Autocorrect: Set API Key`** in the host (keys are per-window).
4. Watch **Output → AI Autocorrect** while testing.

| File | Purpose |
| --- | --- |
| `python_line_autocorrect.py` | Line autocorrect cases (typos, syntax, skips, manual command) |
| `test.py` | Scratch file (optional) |

### Diagnostic gate

When `autocorrect.line.requireDiagnostic` is `true` (default), the extension **polls Pylance locally** for a red/yellow squiggle on the line. **No API call** happens until a squiggle is found (or you use manual correct).

If you see `no LSP squiggle within 1500ms`, either wait for Pylance, install the Python extension, or set `requireDiagnostic` to `false`.

## Automated (unit)

Pure TypeScript helpers (no VS Code runtime):

```bash
npm test
```

Runs `node --test` against compiled `out/` modules (`languages`, `promptLimits`).
