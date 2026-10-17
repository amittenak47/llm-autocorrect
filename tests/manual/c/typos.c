// C DATA: 10 cases; isolate one function with needed include per trial.
// Enter fix: put the cursor at the END of a broken line and press Enter. The
// extension checks the line just left. Comment lines and blank lines are skipped.
// Manual line fix: menu (Ctrl+Shift+;) then C, or the command
// "Autocorrect: Correct Line Near Cursor".
// Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
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
// return total;. Expect no-op then retrying upstream line ... using syntax
// evidence, or a direct redirect with an LSP cascade; return stays unchanged.
int subtract(int a, int b) {
    // expect: upstream int total = = a - b; -> int total = a - b;
    int total = = a - b;
    return total;
}

// UNFINISHED: type just next header in empty .c, Enter; gate/parser true.
// expect: unfinished function stays open; no } or body inserted
void f(void) {
