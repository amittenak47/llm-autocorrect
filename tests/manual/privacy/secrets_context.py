# Fake-only privacy DATA. Keep this filename: secrets_context.py is NOT secrets.*.
OPENAI_API_KEY = "sk-proj-FAKEFAKEFAKEFAKEFAKEFAKE0000"
password = "not-a-real-password"
AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"

# Enter fix: put the cursor at the END of a broken line and press Enter. The
# extension checks the line just left. Comment lines and blank lines are skipped.
# Manual line fix: menu (Ctrl+Shift+;) then C, or the command
# "Autocorrect: Correct Line Near Cursor".
# Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
# Keep privacy.redactSecrets true; use nearbyMode window and line.contextLines 40
# for this test so the top fake values are in context for the following targets.
# Set line.requireDiagnostic false for these valid-looking name typos, or use C.
# expect: pritn -> print; Output: [privacy] redacted N secret(s) from context
pritn("context redaction works")

# expect: lenght -> len; fixes still work with recognized fake context redacted
count = lenght([1, 2, 3])


# Local stub avoids installing openai or making a network call if code is run.
class OpenAI:
    def __init__(self, api_key):
        self.api_key = api_key


# Defined earlier so clinet can be recognized as a typo for existing client.
client = None
# Target privacy A/B: C avoids dependence on a diagnostic for this assignment.
# 1. Pick a configured CLOUD profile, privacy.skipSecretTargetsForCloud true.
#    Expect NO target request, status: text looks like it contains a secret (cloud profile).
# 2. Pick local (openai-compatible + recognized loopback URL), repeat on same line.
#    Expect clinet -> client; fake token must remain literally identical.
# 3. Fake-only optional A/B: cloud + skipSecretTargetsForCloud false allows send.
# Context redaction does not redact the target itself. Restore settings afterward.
# expect: local clinet -> client; cloud skips secret-bearing target with default privacy settings
clinet = OpenAI(api_key="sk-proj-FAKEFAKEFAKEFAKEFAKEFAKE0000")
