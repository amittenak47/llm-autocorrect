const pythonBuiltins = `False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case _
abs aiter all anext any ascii bin bool breakpoint bytearray bytes callable chr classmethod compile complex delattr dict dir divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed round set setattr slice sorted staticmethod str sum super tuple type vars zip __import__ self cls Exception ValueError TypeError RuntimeError KeyError IndexError StopIteration NotImplementedError`;
const jsBuiltins = `as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of package readonly keyof namespace declare infer asserts any unknown never number boolean string private protected public return set static super switch this throw true try type typeof undefined var void while with yield
console log error warn info debug Math JSON Object Array Promise String Number Boolean BigInt Symbol Map Set WeakMap WeakSet Date RegExp Error TypeError RangeError Infinity NaN Intl Reflect Proxy parseInt parseFloat isNaN isFinite setTimeout clearTimeout setInterval clearInterval fetch require module exports process globalThis window document`;
const commonKeywords = `if else for while do switch case default break continue return class struct enum interface type const static public private protected void int float double char bool long short signed unsigned auto true false null new delete try catch throw finally this super import package using namespace typedef sizeof volatile extern union inline virtual override final abstract string`;
const languageKeywords: Record<string, string> = {
  go: `func var range defer go select chan map make append cap close complex copy imag len new panic print println real recover delete nil iota fallthrough byte rune bool error string int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 complex64 complex128 any comparable fmt Println Printf`,
  rust: `fn let mut pub impl trait use mod crate self Self super where match loop move ref unsafe async await dyn in as box extern macro yield false true None Some Ok Err Vec String Option Result println format vec panic usize isize i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 str`,
  java: `boolean byte extends implements instanceof synchronized throws transient strictfp assert native null String System out println print Integer Double Boolean Character Long Float Short Byte Math Object List ArrayList Map HashMap Set HashSet Optional Exception`,
  c: `restrict _Bool _Complex _Atomic NULL size_t printf fprintf sprintf scanf malloc calloc realloc free strlen memcpy memset FILE stdin stdout stderr`,
  cpp: `alignas alignof constexpr consteval constinit decltype explicit friend mutable noexcept nullptr operator template typename reinterpret_cast static_cast dynamic_cast const_cast thread_local wchar_t std string vector map set cout cin endl size_t printf`,
};

export function builtinNames(languageId: string): Set<string> {
  const words = languageId === "python" ? pythonBuiltins
    : /^(javascript|typescript)(react)?$/.test(languageId) ? jsBuiltins
    : `${commonKeywords} ${languageKeywords[languageId] ?? ""}`;
  return new Set(words.split(/\s+/).filter(Boolean));
}

/** Regex discovery only: order names by the location where each was first defined. */
export function definedNames(lines: string[], languageId: string, near: number, max = 60): string[] {
  const first = new Map<string, number>();
  const add = (name: string | undefined, line: number): void => {
    if (name && /^[A-Za-z_$][\w$]*$/.test(name)) first.set(name, Math.min(line, first.get(name) ?? line));
  };
  const python = languageId === "python";
  const keywords = builtinNames(languageId);
  // Mask comments and strings so fake declarations in them are not names.
  const source = lines.join("\n").replace(
    python ? /#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g
      : /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g,
    (match) => match.replace(/[^\n]/g, " ")
  );
  const codeLines = source.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const line of codeLines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const rowAt = (position: number): number => {
    let row = 0;
    while (row + 1 < offsets.length && offsets[row + 1] <= position) row++;
    return row;
  };
  const params = (text: string, position: number): void => {
    let consumed = 0;
    for (const raw of text.split(",")) {
      const row = rowAt(position + consumed + (raw.match(/^\s*/)?.[0].length ?? 0));
      consumed += raw.length + 1;
      const part = raw.split("=")[0].trim();
      if (!part || part === "/" || part === "*") continue;
      let name: string | undefined;
      if (python || /^(javascript|typescript)(react)?$/.test(languageId) || languageId === "rust") {
        name = part.replace(/^(?:\.\.\.|\*+|&|mut\s+|ref\s+)*/, "").match(/^([A-Za-z_$][\w$]*)/)?.[1];
      } else if (languageId === "go") {
        name = part.match(/^([A-Za-z_]\w*)/)?.[1];
      } else {
        name = part.match(/([A-Za-z_]\w*)\s*(?:\[\s*\])?$/)?.[1];
      }
      if (name && (python || !keywords.has(name) || name === "self")) add(name, row);
    }
  };
  for (const [row, line] of codeLines.entries()) {
    if (python) {
      for (const m of line.matchAll(/\b(?:def|class)\s+([A-Za-z_]\w*)/g)) add(m[1], row);
      const assignment = line.match(/^\s*((?:(?:self\.)?[A-Za-z_]\w*\s*,\s*)*(?:self\.)?[A-Za-z_]\w*)\s*(?::[^=]+)?=(?!=)/);
      if (assignment) for (const name of assignment[1].split(",")) add(name.trim().replace(/^self\./, ""), row);
      for (const m of line.matchAll(/\bfor\s+([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s+in\b/g)) {
        for (const name of m[1].split(",")) add(name.trim(), row);
      }
      if (/\b(?:with|except)\b/.test(line)) {
        for (const m of line.matchAll(/\bas\s+([A-Za-z_]\w*)/g)) add(m[1], row);
      }
      const imports = line.match(/^\s*(?:from\s+[\w.]+\s+)?import\s+(.+)/);
      if (imports) {
        for (const item of imports[1].replace(/[()]/g, "").split(",")) {
          const m = item.trim().match(/^([A-Za-z_]\w*)(?:\.[\w.]+)?(?:\s+as\s+([A-Za-z_]\w*))?/);
          if (m) add(m[2] ?? m[1], row);
        }
      }
    } else {
      for (const m of line.matchAll(/\b(?:function|class|interface|type|func|fn|struct|enum)\s+([A-Za-z_$][\w$]*)/g)) add(m[1], row);
      for (const m of line.matchAll(/\b(?:const|let|var)\s+(?:mut\s+)?([A-Za-z_$][\w$]*)/g)) add(m[1], row);
      for (const m of line.matchAll(/\b([A-Za-z_]\w*(?:(?:::|\.)[A-Za-z_]\w*)*(?:<[^;=()]+>)?(?:\[\])?)\s+[*&]*\s*([A-Za-z_]\w*)\s*(?==|\()/g)) {
        if (!/^(return|throw|new|delete|case|else|if|while|switch|for)$/.test(m[1])) add(m[2], row);
      }
    }
  }
  const functions = python ? /\bdef\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g
    : /\b(?:function|func|fn)\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g;
  for (const m of source.matchAll(functions)) params(m[2], m.index! + m[0].indexOf("(") + 1);
  if (!python) {
    // C-style methods and arrow functions (typed or untyped).
    for (const m of source.matchAll(/\b([A-Za-z_]\w*(?:<[^;=()]+>)?(?:\[\])?)\s+[*&]*\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
      if (!/^(return|throw|new|delete|else)$/.test(m[1])) params(m[3], m.index! + m[0].indexOf("(") + 1);
    }
    for (const m of source.matchAll(/\(([^)]*)\)\s*(?::[^=\n]+)?=>/g)) params(m[1], m.index! + 1);
  }
  return [...first].sort((a, b) => Math.abs(a[1] - near) - Math.abs(b[1] - near) || a[1] - b[1])
    .slice(0, Math.max(0, max)).map(([name]) => name);
}
