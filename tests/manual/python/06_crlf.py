"""CRLF fixture: keep VS Code's bottom-right line ending indicator at CRLF.

Block fix / docs / caveman / instruction: select lines, menu -> Shift+A to stage,
then E (fix), D then E (docs), F then E (caveman), X (type an instruction) then E.
Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
Do not copy into an LF scratch: test this file itself, Undo between trials.
"""


# DOCS: select only function code, menu (Ctrl+Shift+;) -> Shift+A -> D -> E.
# expect: add docs; preserve code indentation and CRLF; no re-indented code
def average(values):
    total = sum(values)
    count = len(values)
    return total / count if count else 0.0


# CAVEMAN: select only function code, menu -> Shift+A -> F -> E.
# expect: short trailing comments; identical code; CRLF; no stray line breaks
def positive_squares(values):
    result = []
    for value in values:
        if value > 0:
            result.append(value * value)
    return result
