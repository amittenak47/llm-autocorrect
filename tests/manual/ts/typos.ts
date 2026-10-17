// TypeScript DATA: 10 cases; intentionally excluded from project compilation.
// Isolate one function with context; use .ts language mode.
// Enter fix: put the cursor at the END of a broken line and press Enter. The
// extension checks the line just left. Comment lines and blank lines are skipped.
// Manual line fix: menu (Ctrl+Shift+;) then C, or the command
// "Autocorrect: Correct Line Near Cursor".
// Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
// Name/method typos need an LSP diagnostic or line.requireDiagnostic false.

function announce(message: string): void {
    // expect: consle -> console
    consle.log(message);
}

function increment(count: number): number {
    // expect: cosnt -> const
    cosnt next: number = count + 1;
    return next;
}

function square(value: number): number {
    // expect: retrun -> return
    retrun value * value;
}

// expect: fucntion -> function
fucntion add(a: number, b: number): number {
    return a + b;
}

function positive(value: number): boolean {
    // expect: add ) before { in if condition
    if (value > 0 {
        return true;
    }
    return false;
}

function typedAnswer(): number {
    // expect: nubmer -> number; retain type annotation
    const value: nubmer = 42;
    return value;
}

function sumPair(a: number, b: number): number {
    const total: number = a + b;
    // expect: totla -> total
    return totla;
}

function label(value: number): string {
    if (value > 0) {
        return "positive";
    // expect: esle -> else; retain both braces
    } esle {
        return "other";
    }
}

// UPSTREAM: copy whole function; set line.requireDiagnostic false; Enter at END
// of return total;. Expect no-op then retrying upstream line ... using syntax
// evidence, or direct redirect with an LSP cascade. Retain return/type hints.
function subtract(a: number, b: number): number {
    // expect: upstream const total: number = = a - b; -> const total: number = a - b;
    const total: number = = a - b;
    return total;
}

// UNFINISHED: type just this header into empty .ts, Enter; parser/gate true.
// expect: unfinished function header remains open; no } or body inserted
function f(value: number): void {
