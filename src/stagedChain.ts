import type { StagedOp } from "./stagedSession";

export type StepResult = { ok: true; text: string } | { ok: false; reason: string };

export async function runChain(
  steps: StagedOp[], input: string,
  runStep: (op: StagedOp, text: string, index: number) => Promise<StepResult>
): Promise<{ ok: true; text: string } | { ok: false; reason: string; failedStep: number; op: StagedOp }> {
  let text = input;
  for (let index = 0; index < steps.length; index++) {
    const op = steps[index];
    const result = await runStep(op, text, index);
    if (!result.ok) {
      return { ok: false, reason: result.reason, failedStep: index, op };
    }
    text = result.text;
  }
  return { ok: true, text };
}

export function chainLabel(op: StagedOp, then: StagedOp[]): string {
  return [op, ...then].join("→");
}
