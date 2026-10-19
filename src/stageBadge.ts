// Staged-op markers shown inline before the first staged line (vscode-free so they can be unit tested).

import type { StagedOp } from "./stagedSession";

/** `autocorrect.staged.markerStyle`: op names ("fix → docs") or the pressed keys ("✓ D"). */
export type MarkerStyle = "names" | "letters";

/** Letter per op — the key the user pressed: D docs, F caveman; fix has no key, so a check mark. */
const OP_GLYPH: Record<StagedOp, string> = { fix: "✓", docs: "D", caveman: "F" };

export function opGlyph(op: StagedOp): string {
  return OP_GLYPH[op] ?? "?";
}

/** Ops in run order as letters: fix → "✓", fix → docs → "✓D", docs → caveman → "DF". */
export function badgeOps(op: StagedOp, then: StagedOp[]): string {
  return [op, ...then].map(opGlyph).join("");
}

/**
 * One marker text per op, in run order, so each can be drawn in its own colour:
 * names → ["fix", "→ docs"], letters → ["✓", "D"].
 */
export function opMarkerTexts(ops: StagedOp[], style: MarkerStyle): string[] {
  return ops.map((op, i) =>
    style === "letters" ? opGlyph(op) : i === 0 ? op : `→ ${op}`
  );
}
