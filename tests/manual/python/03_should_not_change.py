"""Valid Python 3.10+ controls: every executable line should stay unchanged.

Enter fix: put the cursor at the END of a target line and press Enter. The
extension checks the line just left. Comment lines and blank lines are skipped.
Set autocorrect.line.requireDiagnostic false to exercise correct lines, or use:
Manual line fix: menu (Ctrl+Shift+;) then C, or the command
"Autocorrect: Correct Line Near Cursor".
Expected Output: UNCHANGED, a cached no-op, or
local check rejected (changed string literal) if the model tries to edit a literal.
With gate true and no diagnostic, a skip with zero calls is also correct.
Repeat quickly to check no-op caching. Restore the gate afterward.
"""

from functools import wraps
from typing import Callable


# expect: unchanged; recieve_buffer is an intentional custom name, not a typo
recieve_buffer = []
# expect: unchanged; custom identifier is consistently used
recieve_buffer.append("packet")
# expect: unchanged; misspellings inside a string are intentional data
print("Helo wrold")
# expect: unchanged; preserve single-quote style
single_quote = 'hello'
# expect: unchanged; preserve double-quote style
double_quote = "hello"
# expect: unchanged; not an invitation to rewrite spelling in literals
error_message = "unkown adress recieved"
# expect: unchanged; numeric literals are intentional
values = [1, 2, 3, 4, 5, 6]
# expect: unchanged; long comprehension is valid
normalized = [(index, value * value, str(value)) for index, value in enumerate(values) if value % 2 == 0 and index < 10]
# expect: unchanged; dictionary comprehension is valid
lookup = {value: value * value for value in values}
# expect: unchanged; set comprehension is valid
unique_remainders = {value % 3 for value in values}
# expect: unchanged; generator expression is valid
positive_total = sum(value for value in values if value > 0)
# expect: unchanged; lambda is deliberate
scale = lambda value: value * 2
# expect: unchanged; walrus is valid Python
if (count := len(values)) > 0:
    # expect: unchanged; f-string placeholder refers to a defined name
    summary = f"count={count}"


# expect: unchanged; valid decorator factory
def trace(function: Callable) -> Callable:
    # expect: unchanged; valid decorator
    @wraps(function)
    # expect: unchanged; variadic wrapper signature is valid
    def wrapper(*args, **kwargs):
        # expect: unchanged; argument expansion is valid
        return function(*args, **kwargs)
    # expect: unchanged
    return wrapper


# expect: unchanged; decorator and typed signature remain intact
@trace
def typed_total(items: list[int], offset: int = 0) -> int:
    # expect: unchanged; annotation is intentional
    total: int = sum(items) + offset
    # expect: unchanged
    return total


# expect: unchanged; union type hints are valid
def describe(value: int | None) -> str:
    # expect: unchanged; match/case is valid in Python 3.10+
    match value:
        # expect: unchanged
        case None:
            # expect: unchanged
            return "missing"
        # expect: unchanged; guarded case is valid
        case number if number > 0:
            # expect: unchanged
            return "positive"
        # expect: unchanged; wildcard is valid
        case _:
            # expect: unchanged
            return "zero or negative"


# expect: unchanged; slices are Python, not C++
evens = values[::2]
# expect: unchanged; second slice is valid Python too
odds = values[1::2]
# expect: unchanged; this f-string literal contains intentional misspellings
message = f"Helo {single_quote}, wrold"
