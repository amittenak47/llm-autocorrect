// C DATA: 10 cases; isolate one function with needed include per trial.
// Enter fix: put the cursor at the END of a broken line and press Enter. The
// extension checks the line just left. Comment lines and blank lines are skipped.
// Manual line fix: menu (Ctrl+Shift+; / Cmd+Shift+; on macOS) then C, or the command
// "Autocorrect: Correct Line Near Cursor".
// Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
// With line.wholeStatement true, ordinary body targets stay on one line:
// enclosing block braces are not continuations. Check TARGET in
// [line] prompt (user):; open parentheses/brackets still expand a statement.
// C has no built-in parser. These trials rely on the C/C++ language server
// (cpptools is installed); wait for Problems diagnostics before Enter trials.
// Balanced name typos need an LSP diagnostic, gate-off Enter, or manual C.
#include <stdio.h>

void announce(int value) {
    // expect: prinft -> printf
    prinft("%d\n", value);
}

int square(int value) {
    // expect: retrun -> return
    retrun value * value;
}

int answer(void) {
    // expect: insert ; after 42
    int value = 42
    return value;
}

int increment(int value) {
    // expect: cosnt -> const
    cosnt int next = value + 1;
    return next;
}

int positive(int value) {
    // expect: add ) before { in if condition
    if (value > 0 {
        return 1;
    }
    return 0;
}

int sum_pair(int a, int b) {
    int total = a + b;
    // expect: totla -> total
    return totla;
}

int double_value(int value) {
    // expect: remove duplicate = so int result = value * 2;
    int result = = value * 2;
    return result;
}

int sign_value(int value) {
    if (value > 0) {
        return 1;
    // expect: esle -> else; retain both braces
    } esle {
        return 0;
    }
}

// UPSTREAM: copy function; set line.requireDiagnostic false; Enter at END of
// return total;. With a cpptools diagnostic on the broken declaration, expect
// no-op on the single return TARGET then retrying upstream line ..., or a direct
// redirect with an LSP cascade. Return and enclosing braces stay unchanged.
// Without language-server evidence, no upstream retry is expected, even gate-off.
int subtract(int a, int b) {
    // expect: upstream int total = = a - b; -> int total = a - b;
    int total = = a - b;
    return total;
}

// UNFINISHED: type just next header in empty .c, Enter; diagnostic gate true.
// There is no parser to suppress unfinished-code errors. If cpptools reports
// no error/warning on the header, expect no call and no } or body inserted.
// If cpptools reports a missing closer, record the LSP diagnostic and result;
// a call is allowed by that evidence (unlike parser-only unfinished-code trials).
void f(void) {
