/** Strip markdown code fences a model may wrap its answer in, despite instructions. */
export function stripFences(text: string): string {
  let t = text.trim();
  const fence = t.match(/^```[\w+-]*\r?\n([\s\S]*?)\r?\n?```$/);
  if (fence) {
    t = fence[1];
  }
  return t;
}
