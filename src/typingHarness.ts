import * as fs from "fs";
import * as vscode from "vscode";

export interface TypingStep {
  insert: string;
  enter?: boolean;
  clean?: string;
}

export interface TypingPlan {
  version?: number;
  languageId?: string;
  charDelayMs?: number;
  afterEnterMs?: number;
  steps: TypingStep[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replay a prepare_plan.py JSON: insert each line, then a separate leading newline
 * so lineCorrector.enterLineFromChange treats it as Enter.
 */
export async function runTypingPlan(
  plan: TypingPlan,
  output: vscode.OutputChannel,
  token: vscode.CancellationToken
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("Open a Python editor tab first (e.g. tests/harness/scratch.py)");
  }

  const charDelay = Math.max(0, plan.charDelayMs ?? 0);
  const afterEnter = Math.max(0, plan.afterEnterMs ?? 3500);
  const steps = plan.steps ?? [];
  output.appendLine(
    `[harness] starting ${steps.length} steps · charDelay=${charDelay}ms · afterEnter=${afterEnter}ms`
  );

  for (let i = 0; i < steps.length; i++) {
    if (token.isCancellationRequested) {
      output.appendLine(`[harness] cancelled at step ${i + 1}/${steps.length}`);
      return;
    }
    const step = steps[i];
    const insert = step.insert ?? "";

    if (charDelay > 0 && insert.length > 0) {
      for (const ch of insert) {
        if (token.isCancellationRequested) {
          return;
        }
        await editor.edit((b) => {
          b.insert(editor.selection.active, ch);
        });
        await sleep(charDelay);
      }
    } else if (insert.length > 0) {
      await editor.edit((b) => {
        b.insert(editor.selection.active, insert);
      });
    }

    if (step.enter !== false) {
      // Separate edit starting with \n — required for Enter detection.
      await editor.edit((b) => {
        b.insert(editor.selection.active, "\n");
      });
      output.appendLine(
        `[harness] step ${i + 1}/${steps.length} Enter after: ${JSON.stringify(insert.slice(0, 80))}`
      );
      await sleep(afterEnter);
    }
  }

  output.appendLine(`[harness] done (${steps.length} steps)`);
  void vscode.window.showInformationMessage(`Autocorrect harness finished (${steps.length} steps)`);
}

export async function pickAndRunTypingHarness(output: vscode.OutputChannel): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { "Harness plan": ["json"] },
    title: "Select typing plan JSON (from prepare_plan.py)",
  });
  if (!uris?.[0]) {
    return;
  }
  const raw = fs.readFileSync(uris[0].fsPath, "utf8");
  const plan = JSON.parse(raw) as TypingPlan;
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error("Plan has no steps[]");
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Autocorrect typing harness",
      cancellable: true,
    },
    async (_progress, token) => {
      await runTypingPlan(plan, output, token);
    }
  );
}
