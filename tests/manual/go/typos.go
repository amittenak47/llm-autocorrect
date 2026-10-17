// Go DATA: 10 cases; keep package/import when isolating a function.
// Enter fix: put the cursor at the END of a broken line and press Enter. The
// extension checks the line just left. Comment lines and blank lines are skipped.
// Manual line fix: menu (Ctrl+Shift+;) then C, or the command
// "Autocorrect: Correct Line Near Cursor".
// Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
// No Go LSP is installed here: gate-on uses parser syntax errors only.
// For balanced name typos use line.requireDiagnostic false or manual C.
package main

import "fmt"

// 1. Printing name.
func announce(message string) {
    // expect: fmt.Pritnln -> fmt.Println
    fmt.Pritnln(message)
}

// 2. Return keyword.
func square(value int) int {
    // expect: retrun -> return
    retrun value * value
}

// 3. Declaration keyword.
func answer() int {
    // expect: vra -> var
    vra value int = 42
    return value
}

// 4. Function keyword, Enter on header.
// expect: fucn -> func
fucn add(a int, b int) int {
    return a + b
}

// 5. Parameter list missing ), complete function body already present.
// expect: add ) after int so header is func double(value int) int {
func double(value int int {
    return value * 2
}

// 6. Go short declaration is :=, not : =.
func next(count int) int {
    // expect: : = -> :=
    value : = count + 1
    return value
}

// 7. Earlier local name.
func sumPair(a int, b int) int {
    total := a + b
    // expect: totla -> total
    return totla
}

// 8. Else keyword; keep } and else together on same physical line.
func signLabel(value int) string {
    if value > 0 {
        return "positive"
    // expect: esle -> else; retain both braces
    } esle {
        return "other"
    }
}

// 9. UPSTREAM: copy whole function; set line.requireDiagnostic false (no Go LSP).
// Enter at END of return total. Expect initial no-op then retrying upstream
// line ...: the declaration has real parser syntax evidence; return stays intact.
func subtract(a int, b int) int {
    // expect: upstream : = -> := in total declaration
    total : = a - b
    return total
}

// 10. UNFINISHED: type only header in a scratch with package main, then Enter.
// Keep parser/gate true: no } or body should be inserted.
// expect: unfinished func header stays open; no automatic closing brace
func f() {
