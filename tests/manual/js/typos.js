// JavaScript DATA: 10 cases. Isolate one function with its context per trial.
// Enter fix: put the cursor at the END of a broken line and press Enter. The
// extension checks the line just left. Comment lines and blank lines are skipped.
// Manual line fix: menu (Ctrl+Shift+;) then C, or the command
// "Autocorrect: Correct Line Near Cursor".
// Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
// Name/method typos need an LSP diagnostic or line.requireDiagnostic false.

// 1. Console method receiver.
function announce(message) {
    // expect: consle -> console
    consle.log(message);
}

// 2. Declaration keyword.
function nextCount(count) {
    // expect: cosnt -> const
    cosnt next = count + 1;
    return next;
}

// 3. Return keyword.
function square(value) {
    // expect: retrun -> return
    retrun value * value;
}

// 4. Function keyword, Enter at END of header.
// expect: fucntion -> function
fucntion add(a, b) {
    return a + b;
}

// 5. Missing ) before {, with complete body/closing brace already present.
function positive(value) {
    // expect: add ) before { in if condition
    if (value > 0 {
        return true;
    }
    return false;
}

// 6. Assignment requires a right-hand side.
function answer() {
    // expect: remove duplicate = so declaration is const value = 42;
    const value = = 42;
    return value;
}

// 7. Defined local name.
function sumPair(a, b) {
    const total = a + b;
    // expect: totla -> total
    return totla;
}

// 8. Else keyword.
function signLabel(value) {
    if (value > 0) {
        return "positive";
    // expect: esle -> else; retain both braces
    } esle {
        return "other";
    }
}

// 9. UPSTREAM: copy whole function; set line.requireDiagnostic false (root is
// above target). Enter at END of return total;. Expect initial no-op on return,
// then retrying upstream line ... using real syntax evidence; body unchanged.
// An LSP cascade can instead cause redirecting fix from line ... immediately.
function subtract(a, b) {
    // expect: upstream const total = = a - b; -> const total = a - b;
    const total = = a - b;
    return total;
}

// 10. UNFINISHED: type only next header into an empty JS scratch, then Enter.
// Gate/parser true; no LSP closure diagnostic. Must NOT insert } or a body.
// expect: unfinished function header remains open; no automatic closing brace
function f() {
