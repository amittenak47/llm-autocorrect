/** Convert path globs to a case-insensitive, whole-path expression. */
export function globToRegExp(glob: string): RegExp {
  const pattern = glob.replace(/\\/g, "/");
  function compile(part: string): string {
    let result = "";
    for (let i = 0; i < part.length; i++) {
      const ch = part[i];
      if (ch === "*") {
        if (part[i + 1] === "*") {
          i++;
          if (part[i + 1] === "/") {
            i++;
            result += "(?:.*/)?";
          } else {
            result += ".*";
          }
        } else {
          result += "[^/]*";
        }
      } else if (ch === "?") {
        result += "[^/]";
      } else if (ch === "{") {
        let depth = 1;
        let end = i + 1;
        const alternatives: string[] = [];
        let start = end;
        for (; end < part.length && depth > 0; end++) {
          if (part[end] === "{") depth++;
          if (part[end] === "}") depth--;
          if ((part[end] === "," && depth === 1) || depth === 0) {
            alternatives.push(part.slice(start, end));
            start = end + 1;
          }
        }
        if (depth === 0) {
          result += `(?:${alternatives.map(compile).join("|")})`;
          i = end - 1;
        } else {
          result += "\\{";
        }
      } else {
        result += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
    }
    return result;
  }
  return new RegExp(`^${compile(pattern)}$`, "i");
}

export function matchesAny(path: string, globs: string[]): boolean {
  const normalized = path.replace(/\\/g, "/");
  return globs.some((glob) => globToRegExp(glob).test(normalized));
}
