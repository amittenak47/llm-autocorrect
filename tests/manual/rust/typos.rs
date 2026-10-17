// Rust DATA: 10 cases. Isolate each function; do not compile this fixture.
// Enter fix: put the cursor at the END of a broken line and press Enter. The
// extension checks the line just left. Comment lines and blank lines are skipped.
// Manual line fix: menu (Ctrl+Shift+; / Cmd+Shift+; on macOS) then C, or the command
// "Autocorrect: Correct Line Near Cursor".
// Output -> "LLM Autocorrect" shows every step (set autocorrect.debug: true).
// With line.wholeStatement true, ordinary body targets stay on one line:
// enclosing block braces are not continuations. Check TARGET in
// [line] prompt (user):; open parentheses/brackets still expand a statement.
// rust-analyzer has limited diagnostics for lone .rs outside a Cargo project.
// Name/macro typos may need line.requireDiagnostic false or manual C.

fn announce(message: &str) {
    // expect: pritnln! -> println!
    pritnln!("{}", message);
}

fn square(value: i32) -> i32 {
    // expect: retrun -> return
    retrun value * value;
}

fn answer() -> i32 {
    // expect: lte -> let
    lte value = 42;
    value
}

// expect: nf -> fn
nf add(a: i32, b: i32) -> i32 {
    a + b
}

fn positives() -> Vec<i32> {
    // expect: insert ; after vec![1, 2, 3]
    let values = vec![1, 2, 3]
    values
}

fn next_count(count: i32) -> i32 {
    // expect: remove duplicate = so let value = count + 1;
    let value = = count + 1;
    value
}

fn sum_pair(a: i32, b: i32) -> i32 {
    let total = a + b;
    // expect: totla -> total
    totla
}

fn sign_label(value: i32) -> &'static str {
    if value > 0 {
        "positive"
    // expect: esle -> else; retain both braces
    } esle {
        "other"
    }
}

// The initial TARGET is only the return/final-expression line unless redirected;
// a retry targets only the broken declaration, never the enclosing function.
// UPSTREAM: copy whole function; set line.requireDiagnostic false; Enter at END
// of final expression total. Expect no-op then retrying upstream line ... using
// real syntax evidence, or a direct redirect with an LSP cascade; total retained.
fn subtract(a: i32, b: i32) -> i32 {
    // expect: upstream let total = = a - b; -> let total = a - b;
    let total = = a - b;
    total
}

// UNFINISHED: type only next header in fresh .rs, then Enter; gate/parser true.
// expect: unfinished fn header stays open; no } or body inserted
fn f() {
