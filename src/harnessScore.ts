export interface StepOutcome {
  index: number;
  kind: "fixed" | "missed" | "wrongFix" | "keptCorrect" | "brokeCorrect";
  insert: string;
  clean: string;
  final: string;
}

export interface HarnessScore {
  fixed: number;
  missed: number;
  wrongFix: number;
  keptCorrect: number;
  brokeCorrect: number;
  precision: number;
  recall: number;
  outcomes: StepOutcome[];
}

/** Exact LCS anchors, then pair remaining expected/actual lines in order. */
export function alignLines(expected: string[], actual: string[]): Array<number | undefined> {
  const a = expected.map((line) => line.trimEnd());
  const b = actual.map((line) => line.trimEnd());
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const anchors: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      anchors.push([i++, j++]);
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  const alignment: Array<number | undefined> = Array(a.length).fill(undefined);
  const used = new Set<number>();
  for (const [ei, ai] of anchors) {
    alignment[ei] = ai;
    used.add(ai);
  }
  let nextActual = 0;
  for (let ei = 0; ei < a.length; ei++) {
    if (alignment[ei] !== undefined) continue;
    while (nextActual < b.length && used.has(nextActual)) nextActual++;
    if (nextActual < b.length) alignment[ei] = nextActual++;
  }
  return alignment;
}

export function scoreHarness(steps: { insert: string; clean: string }[], finalLines: string[]): HarnessScore {
  const alignment = alignLines(steps.map((step) => step.clean), finalLines);
  const score: HarnessScore = {
    fixed: 0, missed: 0, wrongFix: 0, keptCorrect: 0, brokeCorrect: 0,
    precision: 0, recall: 0, outcomes: [],
  };
  steps.forEach((step, index) => {
    const insert = step.insert.trimEnd();
    const clean = step.clean.trimEnd();
    const actual = alignment[index];
    const final = actual === undefined ? "" : finalLines[actual].trimEnd();
    const kind = insert === clean ? (final === clean ? "keptCorrect" : "brokeCorrect")
      : final === clean ? "fixed" : final === insert ? "missed" : "wrongFix";
    score[kind]++;
    score.outcomes.push({ index, kind, insert, clean, final });
  });
  const attempted = score.fixed + score.wrongFix + score.brokeCorrect;
  const errors = score.fixed + score.missed + score.wrongFix;
  score.precision = attempted ? score.fixed / attempted : 0;
  score.recall = errors ? score.fixed / errors : 0;
  return score;
}
