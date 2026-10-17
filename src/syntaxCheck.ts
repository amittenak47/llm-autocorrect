import * as path from "path";
import { statementSpan } from "./statementSpan";

export interface ParserError {
  line: number;
  column: number;
  endLine: number;
  message: string;
}

interface ParserNode {
  isError: boolean;
  isMissing: boolean;
  type: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number };
  children: ParserNode[];
}

interface ParserTree {
  rootNode: ParserNode;
  delete(): void;
}

interface ParserInstance {
  setLanguage(language: unknown): void;
  parse(text: string): ParserTree | null;
  delete(): void;
}

interface ParserRuntime {
  Parser: {
    new(): ParserInstance;
    init(options: { locateFile: (file: string) => string }): Promise<void>;
  };
  Language: { load(file: string): Promise<unknown> };
}

let runtimePromise: Promise<ParserRuntime | undefined> | undefined;

function runtime(wasmDir: string): Promise<ParserRuntime | undefined> {
  return runtimePromise ??= (async () => {
    try {
      const ts = require(path.join(wasmDir, "tree-sitter.js")) as ParserRuntime;
      await ts.Parser.init({ locateFile: (file) => path.join(wasmDir, file) });
      return ts;
    } catch {
      return undefined;
    }
  })();
}

export function grammarFor(languageId: string): string | undefined {
  switch (languageId) {
    case "python":
    case "javascript":
    case "typescript":
    case "go":
    case "java":
    case "rust":
    case "cpp":
      return languageId;
    case "c":
      return "cpp";
    default:
      return undefined;
  }
}

/**
 * Drop parser errors that only mean "still typing" — a missing closing bracket, or an error whose own line(s) leave
 * a bracket open (`function f() {`, `xs = [1, 2,`) — so an instant parse does not make Enter close the block early.
 * Real typos on balanced lines (`defn f():`, `for i in x`) are kept; the language server still covers the rest.
 */
export function dropUnfinished(errors: ParserError[], lines: string[], commentPrefixes: string[]): ParserError[] {
  return errors.filter((error) => {
    if (/^missing "[)\]}]" \(parser\)$/.test(error.message)) return false;
    const next = error.endLine + 1;
    return statementSpan(lines, next, error.endLine - error.line + 2, commentPrefixes).startLine === next;
  });
}

export function defaultWasmDir(): string {
  return path.join(path.dirname(require.resolve("@vscode/tree-sitter-wasm")), "");
}

export class SyntaxChecker {
  private readonly parsers = new Map<string, Promise<ParserInstance | undefined>>();

  constructor(private readonly wasmDir: string) {}

  supports(languageId: string): boolean {
    return grammarFor(languageId) !== undefined;
  }

  private parser(grammar: string): Promise<ParserInstance | undefined> {
    let pending = this.parsers.get(grammar);
    if (!pending) {
      pending = (async () => {
        let parser: ParserInstance | undefined;
        try {
          const ts = await runtime(this.wasmDir);
          if (!ts) return undefined;
          const language = await ts.Language.load(path.join(this.wasmDir, `tree-sitter-${grammar}.wasm`));
          parser = new ts.Parser();
          parser.setLanguage(language);
          return parser;
        } catch {
          parser?.delete();
          return undefined;
        }
      })();
      this.parsers.set(grammar, pending);
    }
    return pending;
  }

  async errors(languageId: string, text: string): Promise<ParserError[] | undefined> {
    const grammar = grammarFor(languageId);
    if (!grammar) return undefined;
    const parser = await this.parser(grammar);
    if (!parser) return undefined;
    const tree = parser.parse(text);
    if (!tree) return undefined;
    try {
      const errors: ParserError[] = [];
      const pending = [tree.rootNode];
      while (pending.length > 0 && errors.length < 50) {
        const node = pending.pop()!;
        if (node.isError || node.isMissing) {
          errors.push({
            line: node.startPosition.row,
            column: node.startPosition.column,
            endLine: node.endPosition.row,
            message: node.isError ? "syntax error (parser)" : `missing "${node.type}" (parser)`,
          });
          if (node.isError) continue;
        }
        const children = node.children;
        for (let i = children.length - 1; i >= 0; i--) {
          pending.push(children[i]);
        }
      }
      return errors.sort((a, b) => a.line - b.line || a.column - b.column);
    } finally {
      tree.delete();
    }
  }
}
