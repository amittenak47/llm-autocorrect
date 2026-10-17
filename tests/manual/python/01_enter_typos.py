"""Enter-fix DATA: isolate one case with its context before each trial.

Enter fix: put the cursor at the END of a broken line and press Enter. The
extension checks the line just left. Comment lines and blank lines are skipped.
Manual line fix: menu (Ctrl+Shift+;) then C, or the command
"Autocorrect: Correct Line Near Cursor".
Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
For balanced name/method typos, require an LSP squiggle or set
autocorrect.line.requireDiagnostic: false; parser alone detects syntax only.
Restore each case between trials. Do not execute this intentionally broken file.
"""


# CASE 01: greeting builtin.
def greet(name):
    # expect: pritn -> print
    pritn(f"Hello {name}")


# CASE 02: builtin length (lenght is not a defined custom function).
def count_items(items):
    # expect: lenght -> len
    return lenght(items)


# CASE 03: loop bounds builtin.
def row_numbers(count):
    rows = []
    # expect: rnage -> range
    for index in rnage(count):
        rows.append(index)
    return rows


# CASE 04: return keyword.
def add(left, right):
    # expect: retrun -> return
    retrun left + right


# CASE 05: while keyword.
def countdown(remaining):
    # expect: whiel -> while
    whiel remaining > 0:
        remaining -= 1
    return remaining


# CASE 06: function keyword; Enter on header for this case.
# expect: defn -> def
defn multiply(left, right):
    return left * right


# CASE 07: else keyword; do not change the adjacent if/return.
def label_score(score):
    if score >= 60:
        return "pass"
    # expect: esle: -> else:
    esle:
        return "retry"


# CASE 08: missing def colon, with an existing body (not a new unfinished def).
# expect: add : after def header
def square(value)
    return value * value


# CASE 09: missing if colon.
def positive_label(value):
    # expect: add : after if header
    if value > 0
        return "positive"
    return "nonpositive"


# CASE 10: missing for colon.
def copy_items(items):
    copied = []
    # expect: add : after for header
    for item in items
        copied.append(item)
    return copied


# CASE 11: missing while colon.
def halve_until_small(value):
    # expect: add : after while header
    while value > 10
        value //= 2
    return value


# CASE 12: missing class colon.
# expect: add : after class header
class Counter
    def __init__(self):
        self.value = 0


# CASE 13: missing closer. Gate-on/parser-only may treat this as unfinished.
# Use LSP evidence or gate-off Enter/manual C to request the repair explicitly.
def announce(message):
    # expect: add the missing closing ) to print(message
    print(message


# CASE 14: assignment is not a comparison in a Python if.
def is_empty_count(count):
    # expect: = -> == in the if condition
    if count = 0:
        return True
    return False


# CASE 15: local name must be inferred from its earlier definition.
def invoice_total(prices):
    total = sum(prices)
    # expect: totl -> total
    return totl


# CASE 16: list method.
def collect_name(name):
    names = []
    # expect: apend -> append
    names.apend(name)
    return names


# CASE 17: string method; literal contents must stay unchanged.
def loud_name(name):
    # expect: uppper -> upper
    return name.uppper()


# CASE 18: missing dictionary separator.
def make_user(name):
    # expect: add : between "name" and name
    return {"name" name}


# CASE 19: numeric list missing one comma (not adjacent string concatenation).
def sample_levels():
    # expect: add , between 10 and 20
    return [10 20, 30]


# CASE 20: f-string placeholder is code; preserve the literal prefix.
def render_total(values):
    result = sum(values)
    # expect: {reslt} -> {result}; keep "Total: " unchanged
    return f"Total: {reslt}"


# CASE 21: nested indentation must stay exactly 12 spaces on target.
def report_positive(values):
    for value in values:
        if value > 0:
            # expect: pritn -> print; preserve the target's 12 spaces
            pritn(value)


# CASE 22: misspelled import module (no installation required for collections).
def character_counts(text):
    # expect: colections -> collections
    import colections
    return collections.Counter(text)


# CASE 23: whole-statement case, call spans exactly two physical code lines.
# The bracket opened on line 1 is unclosed; line 2 lacks a comma between 2 and 3.
# Enter at END of the SECOND call line; line.wholeStatement true sends both.
# Desired repairs: add comma between 2 and 3 AND close ]. sum(...) is closed.
# Parser-only may suppress the open bracket as unfinished: try LSP/gate-off or C.
# Balanced A/B control: append ] yourself, then retry just the missing comma.
def sum_sample():
    # expect: whole call -> result = sum([ then 1, 2, 3]); fix second-line comma and unclosed [
    result = sum([
        1, 2 3)
    return result


# CASE 24: another misspelled builtin.
def sorted_scores(scores):
    # expect: sortde -> sorted
    return sortde(scores)


# CASE 25: boolean constant.
def feature_enabled():
    # expect: Treu -> True
    return Treu


# CASE 26: exception keyword.
def validate_age(age):
    if age < 0:
        # expect: rasie -> raise
        rasie ValueError("negative age")
    return age


# CASE 27: elif keyword.
def sign(value):
    if value < 0:
        return -1
    # expect: elfi -> elif
    elfi value == 0:
        return 0
    return 1


# CASE 28: logical operator typo.
def in_open_interval(value, lower, upper):
    # expect: adn -> and
    return value > lower adn value < upper


# SKIP controls: Enter on this comment, then on the blank line below.
# expect: comment-only and blank lines are skipped; no LLM request

