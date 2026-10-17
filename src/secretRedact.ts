const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const TOKEN_PATTERN = /sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|(?:AKIA|ASIA)[0-9A-Z]{16}|xox[abposr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|[rs]k_(?:live|test)_[A-Za-z0-9]{16,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g;
const ASSIGNMENT_PATTERN = /(\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|auth)\b["']?\s*[:=]\s*)(["'])((?:\\.|(?!\2)[^\\\r\n]){6,})\2/gi;

export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0;
  const blocks = text.replace(PRIVATE_KEY_PATTERN, () => {
    count++;
    return "«redacted»";
  });
  const assigned = blocks.replace(ASSIGNMENT_PATTERN, (match, prefix: string, quote: string, value: string) => {
    if (value === "«redacted»") return match;
    count++;
    return `${prefix}${quote}«redacted»${quote}`;
  });
  const redacted = assigned.replace(TOKEN_PATTERN, () => {
    count++;
    return "«redacted»";
  });
  return { text: redacted, count };
}

export function containsSecret(text: string): boolean {
  return new RegExp(PRIVATE_KEY_PATTERN.source).test(text) ||
    new RegExp(TOKEN_PATTERN.source).test(text) ||
    new RegExp(ASSIGNMENT_PATTERN.source, "i").test(text);
}
