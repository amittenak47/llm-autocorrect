"""
Manual test cases for LLM Autocorrect (Python line mode).

How to run:
  1. F5 → Extension Development Host
  2. Open this file in the host window
  3. View → Output → "LLM Autocorrect"
  4. For each CASE below: edit the broken line, press Enter on the NEXT line
  5. Or select the broken line → "Autocorrect: Correct Selected Line"

Settings (host window):
  "autocorrect.languages": ["python"]
  "autocorrect.debug": true
  "autocorrect.line.requireDiagnostic": true   # default — needs Pylance squiggle
  # Set requireDiagnostic to false if Pylance is slow / missing squiggles

Expected log flow (with diagnostic gate ON):
  [line] Enter on python_line_autocorrect.py:N, scheduling check
  [line] diagnostic gate: waiting up to 1500ms ... (local only, no API call)
  [line] diagnostic gate: passed after Xms — L? [Error] ...
  [line] calling LLM for python_line_autocorrect.py:N
  [line] python_line_autocorrect.py:N  "broken" -> "fixed"

Cases marked NO-AUTO need requireDiagnostic: false OR a visible squiggle before Enter.
"""

# =============================================================================
# CASE 1: typo in builtin — should fix print
# Edit line below, press Enter on next line. Expect: pritn → print
# =============================================================================
pritn("hello")

# =============================================================================
# CASE 2: undefined name — Pylance usually squiggles this
# =============================================================================
defn add(a, b):
    return a + b

# =============================================================================
# CASE 3: syntax error — trailing garbage after valid statement
# Your test.py had: print("hi")f;
# =============================================================================
print("hi")f;

# =============================================================================
# CASE 4: missing closing paren
# =============================================================================
print("unclosed"

# =============================================================================
# CASE 5: should SKIP — blank line (no API call)
# Press Enter on blank line below; extension should ignore
# =============================================================================


# =============================================================================
# CASE 6: should SKIP — comment line
# =============================================================================
# this is a comment with pritn typo — should NOT auto-fix comments

# =============================================================================
# CASE 7: valid code — expect UNCHANGED (may still call LLM if squiggle exists)
# With requireDiagnostic:true, valid lines usually have no squiggle → no API call
# =============================================================================
print("this line is fine")

# =============================================================================
# CASE 8: indented block — typo inside function
# =============================================================================
def greet(name):
    pritn(f"hi {name}")

# =============================================================================
# CASE 9: paste-translate (separate feature) — paste C++ snippet below into this file
# Should offer to convert to Python (not line autocorrect)
# =============================================================================
# int main() { std::cout << "hi"; }

# =============================================================================
# CASE 10: manual-only quick check
# Select ONLY the next line, run "Autocorrect: Correct Selected Line"
# Bypasses diagnostic gate and Enter detection
# =============================================================================
pritn("manual fix me")
