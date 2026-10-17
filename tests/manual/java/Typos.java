// Java DATA: 10 cases; isolate one method in a class Typos wrapper.
// Enter fix: put the cursor at the END of a broken line and press Enter. The
// extension checks the line just left. Comment lines and blank lines are skipped.
// Manual line fix: menu (Ctrl+Shift+; / Cmd+Shift+; on macOS) then C, or the command
// "Autocorrect: Correct Line Near Cursor".
// Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
// With line.wholeStatement true, ordinary body targets stay on one line:
// enclosing block braces are not continuations. Check TARGET in
// [line] prompt (user):; open parentheses/brackets still expand a statement.
// No Java LSP installed here: parser path only with gate true. Name typos need
// line.requireDiagnostic false or manual C. Keep the wrapper's closing brace.
class Typos {
    static void announce(String message) {
        // expect: Sytem -> System
        Sytem.out.println(message);
    }

    static int square(int value) {
        // expect: retrun -> return
        retrun value * value;
    }

    static int answer() {
        // expect: insert ; after 42
        int value = 42
        return value;
    }

    static int increment(int value) {
        // expect: fnial -> final
        fnial int next = value + 1;
        return next;
    }

    static boolean positive(int value) {
        // expect: add ) before { in if condition
        if (value > 0 {
            return true;
        }
        return false;
    }

    static int sumPair(int a, int b) {
        int total = a + b;
        // expect: totla -> total
        return totla;
    }

    static int doubleValue(int value) {
        // expect: remove duplicate = so int result = value * 2;
        int result = = value * 2;
        return result;
    }

    static String label(int value) {
        if (value > 0) {
            return "positive";
        // expect: esle -> else; retain both braces
        } esle {
            return "other";
        }
    }

    // UPSTREAM: copy method + wrapper; set line.requireDiagnostic false; Enter
    // at END of return total;. The parser error spans declaration + return, so
    // expect direct redirect to the declaration before the first LLM call.
    // Only the declaration is TARGET; enclosing class/method and return stay intact.
    // With parser off, LSP evidence may redirect or allow a no-op then upstream retry.
    static int subtract(int a, int b) {
        // expect: upstream declaration gains ; after a - b
        int total = a - b
        return total;
    }

    // UNFINISHED: in a fresh Typos wrapper type just static void f() { then
    // Enter, before typing a method closing brace; gate/parser true.
    // expect: unfinished method stays open; no } or body inserted
    static void f() {
}
