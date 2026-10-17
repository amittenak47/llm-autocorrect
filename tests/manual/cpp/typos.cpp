// C++ DATA: 10 cases; isolate one function and needed includes per trial.
// Enter fix: put the cursor at the END of a broken line and press Enter. The
// extension checks the line just left. Comment lines and blank lines are skipped.
// Manual line fix: menu (Ctrl+Shift+;) then C, or the command
// "Autocorrect: Correct Line Near Cursor".
// Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
// Balanced name/member typos need an LSP diagnostic, gate-off Enter, or C.
#include <iostream>
#include <string>
#include <vector>

void announce(const std::string& message) {
    // expect: std::cuot -> std::cout
    std::cuot << message << std::endl;
}

int square(int value) {
    // expect: retrun -> return
    retrun value * value;
}

int answer() {
    // expect: insert ; after 42
    int value = 42
    return value;
}

int increment(int value) {
    // expect: cosnt -> const
    cosnt int next = value + 1;
    return next;
}

bool positive(int value) {
    // expect: add ) before { in if condition
    if (value > 0 {
        return true;
    }
    return false;
}

int sumPair(int a, int b) {
    int total = a + b;
    // expect: totla -> total
    return totla;
}

std::vector<int> collect(int value) {
    std::vector<int> values;
    // expect: push_bak -> push_back
    values.push_bak(value);
    return values;
}

int signValue(int value) {
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

// UNFINISHED: type just next header into empty .cpp, Enter; gate/parser true.
// expect: unfinished function stays open; no } or body inserted
void f() {
