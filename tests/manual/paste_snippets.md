# Paste translation DATA

Paste translate: copy a snippet, paste it into a `.py` file.
Copy only the contents of ONE fenced block (no fences or Markdown). Use a fresh
Python scratch under `tests/manual/`, `autocorrect.paste.enabled: true`, and a
running active profile. Output → "LLM Autocorrect" shows every step
(set `autocorrect.debug: true`). Never execute the foreign code in Python.

For each foreign snippet, expect an offer to **convert to Python**. First dismiss
an offer: the pasted text must remain unchanged. Paste into an empty scratch again
and accept: expect a faithful translation that prints the same result, with no
invented unrelated function/program. There must never be a silent replacement.
Undo/clear the scratch between languages. A fidelity rejection should explain why
in Output rather than apply unrelated code.

## C++: print hello

```cpp
#include <iostream>

int main() {
    std::cout << "hello" << std::endl;
    return 0;
}
```

Expect Python that prints `hello`; no invented `greet` function.

## JavaScript: arrow function, prints 5

```javascript
const add = (a, b) => a + b;
const total = add(2, 3);
console.log(total);
```

Expect equivalent addition/print, preserving values and behavior.

## Java: class wrapper, prints hello

```java
class PasteHello {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}
```

Expect Python that prints `hello`; no unrelated classes invented.

## Go: short declaration, prints 5

```go
package main

import "fmt"

func main() {
    total := 2 + 3
    fmt.Println(total)
}
```

Expect equivalent arithmetic and print.

## Rust: mutable binding, prints 5

```rust
fn main() {
    let mut total = 2;
    total += 3;
    println!("{}", total);
}
```

Expect equivalent mutation and print, without Rust syntax left in Python.

## Python slice controls: NO conversion offer

Paste this setup first, then copy/paste each slice line individually; also try the
whole block. `[::2]` and `[1::2]` must not be mistaken for C++ scope syntax.
The Python code must remain exactly as pasted; no convert-to-Python offer.

```python
nums = [0, 1, 2, 3, 4, 5]
evens = nums[::2]
odds = nums[1::2]
```
