"""Upstream DATA. Run a-e separately in fresh Python scratch files.

Enter fix: put the cursor at the END of a broken line and press Enter. The
extension checks the line just left. For a/b specifically leave the BODY line.
Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
Manual line fix: menu (Ctrl+Shift+;) then C, or the command
"Autocorrect: Correct Line Near Cursor".
Upstream evidence must be a real syntax error no more than eight lines above.
For a/b the parser error on the header spans into the body line, so Output should
show "redirecting fix from line N to line N-1" before a single LLM call. If you
instead see a no-op on the body line followed by "retrying upstream line", the
redirect still worked, just with one extra call.
In c the unrelated import is INSIDE the eight-line window on purpose: an
unresolved import is not a syntax error, so it must not attract the fix.
"""


# (a) 1. Copy header + body. 2. Wait for diagnostics/parser.
# 3. Cursor at END of return a + b, press Enter (NOT on defn).
# 4. Expect redirecting fix from line ... to line ... (upstream syntax error).
# expect: defn -> def on upstream header; valid return body remains unchanged
defn compute(a, b):
    return a + b


# (b) 1. Copy header + body. 2. Cursor at END of return expression; Enter.
# 3. Expect redirect to def line; body not rewritten or de-indented.
# expect: add : to upstream def area(r) header
def area(r)
    return 3.14159 * r * r


# (c) 1. Copy from the import through show_measurement.
# 2. Pylance should squiggle both lines; if pritn has none, set
#    line.requireDiagnostic false for this case.
# 3. Enter at END of pritn(x). 4. Only pritn changes; numpyy is NOT touched
#    even though it is within eight lines (it is not a syntax error).
# expect: deliberately misspelled numpyy import is NOT touched by the later fix
import numpyy as np

def show_measurement():
    x = 42
    # expect: pritn -> print; leave the unrelated import unchanged
    pritn(x)


# (d) 1. Copy only this valid function to a fresh URI (avoid cached prior no-op).
# 2. Set line.requireDiagnostic false. 3. Enter at END of return doubled.
# 4. Exactly ONE initial LLM call, UNCHANGED, no upstream retry/redirect.
# 5. Repeat promptly: a cached no-op may make zero new calls.
# With gate true and no diagnostic, zero calls is correct instead. Restore true.
def double(value):
    doubled = value * 2
    # expect: valid code stays unchanged; no blind retry of preceding line
    return doubled


# (e) Three independent typing-only trials, not one combined program.
# In a fresh scratch, type exactly one target below, then Enter at END.
# Keep syntax.useParser and line.requireDiagnostic true. Expect no LLM call from
# parser-only unfinished-code evidence, no invented body/closing delimiter.
# Clear the scratch between trials. Do not use manual C to test this skip.
# An LSP can supply additional evidence; record its diagnostic if a call occurs.

# expect: unfinished def f(x): stays as typed; no body/pass added
def f(x):

# Trial 2: define x = True in the scratch first, then type the next target.
# expect: unfinished if x: stays as typed; no body/pass added
if x:

# expect: unfinished list stays open; no ] or values added
items = [1, 2,
