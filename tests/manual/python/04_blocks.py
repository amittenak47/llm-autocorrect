"""Block DATA: select CODE only, excluding the instructions/expect comments.

Block fix / docs / caveman / instruction: select lines, menu -> Shift+A to stage,
then E (fix), D then E (docs), F then E (caveman), X (type an instruction) then E.
Menu is Ctrl+Shift+;. Output -> "LLM Autocorrect" shows every step
(set autocorrect.debug: true). Undo between alternative trials.
"""


# 1. BLOCK FIX: select def through retrun, menu -> Shift+A -> E.
# Alternative immediate fix: select same block, menu -> A (sends immediately;
# A does not need an extra E). Check green staging, spinner, brief apply highlight.
# Four typos below must be fixed as one block, without changing string contents.
def report_sum(numbers):
    total = 0
    # expect: rnage -> range
    for index in rnage(len(numbers)):
        total += numbers[index]
    # expect: pritn -> print
    pritn(total)
    copies = []
    # expect: apend -> append
    copies.apend(total)
    # expect: retrun -> return
    retrun copies


# 2. DOCS: select only def + body, menu -> Shift+A -> D -> E.
# What should happen: add helpful docstring/comments; every code line, literal,
# and indentation remains identical. No new classes or logic. Rewrites reject.
def weighted_average(values, weights):
    numerator = sum(value * weight for value, weight in zip(values, weights))
    denominator = sum(weights)
    return numerator / denominator if denominator else 0.0


# 3. CAVEMAN: select only def + body, menu -> Shift+A -> F -> E.
# What should happen: short trailing comments merged onto original code; no code
# changes, line splitting, new blank lines, or indentation changes.
def unique_in_order(values):
    seen = set()
    result = []
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


# 4. INSTRUCTION: select only def + body, menu -> Shift+A -> X -> type
# "add type hints" -> confirm the input -> E.
# What should happen: parameters/return get appropriate hints for float prices
# and float tax_rate, returning float; arithmetic and variable names preserved.
# This deliberate instruction skips Guardian. Undo before a different modifier.
def price_with_tax(price, tax_rate):
    total = price * (1 + tax_rate)
    return total


# 5. INDENT REGRESSION: select ONLY the method, from its four leading spaces on
# def through return. menu -> Shift+A -> E. Keep class line unselected.
# What should happen: first line keeps four leading spaces; body keeps eight;
# pritn is fixed; method remains in class even if model returns unfenced code.
# Repeat selecting through column 0 of outside_selection: that next line must
# remain outside the staged replacement. Record actual selection before send.
class Reporter:
    def report(self, message):
        # expect: pritn -> print; keep method header/body indentation
        pritn(message)
        return message
outside_selection = "leave this line unchanged"


# 6. RESIZE KEEPING FLAGS: stage case 2, D, X ("add a docstring"), toggle 2, M.
# Press S, W/S to resize, E: op/note/tiers/profile remain. S then Esc restores
# the old range and flags. Esc clears; reopen menu then S starts a new selection.

# 7. EDIT QUEUED OP: stage case 2, D, Shift+E. Cursor inside it, menu -> R
# (or Edit Queued Item at Cursor), F, Shift+E: replaces queued docs with caveman.
# Repeat R then Esc: original item returns. Try pending and ready queue modes.

# 8. FIX THEN DOCS: on a fresh case 1 (report_sum typos), stage -> Shift+D -> E.
# Expect all four typos fixed AND a docstring added in ONE apply. Run Remove or
# Revert at Cursor once: entire original typo block returns. A failed step applies nothing.
