import * as fs from "fs";
import * as vscode from "vscode";
import { cfg } from "./config";
import { scoreHarness } from "./harnessScore";

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
  token: vscode.CancellationToken,
  planPath?: string
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error("Open a Python editor tab first (e.g. tests/harness/scratch.py)");
  }

  const charDelay = Math.max(0, plan.charDelayMs ?? 0);
  const afterEnter = Math.max(0, plan.afterEnterMs ?? 3500);
  const steps = plan.steps ?? [];
  const startLine = editor.selection.active.line;
  const c = cfg();
  const settings = {
    "autocorrect.prompt.includeDiagnostics": c.promptIncludeDiagnostics,
    "autocorrect.prompt.includeNames": c.promptIncludeNames,
    "autocorrect.prompt.examples": c.promptExamples,
    "autocorrect.line.wholeStatement": c.lineWholeStatement,
    "autocorrect.fix.localChecks": c.fixLocalChecks,
  };
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

  await sleep(afterEnter * 2);
  if (token.isCancellationRequested) {
    output.appendLine("[harness] cancelled before scoring");
    return;
  }
  const finalLines = editor.document.getText().split(/\r?\n/).slice(startLine);
  const score = scoreHarness(steps.filter((step) => step.enter !== false)
    .map((step) => ({ insert: step.insert, clean: step.clean ?? step.insert })), finalLines);
  output.appendLine(`[harness] score: fixed=${score.fixed} missed=${score.missed} wrongFix=${score.wrongFix}` +
    ` brokeCorrect=${score.brokeCorrect} keptCorrect=${score.keptCorrect}` +
    ` precision=${(score.precision * 100).toFixed(1)}% recall=${(score.recall * 100).toFixed(1)}%`);
  for (const outcome of score.outcomes) {
    if (outcome.kind === "keptCorrect") continue;
    output.appendLine(`[harness] step ${outcome.index + 1} ${outcome.kind}:` +
      ` insert=${JSON.stringify(outcome.insert)} final=${JSON.stringify(outcome.final)} clean=${JSON.stringify(outcome.clean)}`);
  }
  if (planPath) {
    const scorePath = planPath.replace(/\.json$/i, "") + ".score.json";
    fs.writeFileSync(scorePath, JSON.stringify({ ...score, settings }, null, 2) + "\n", "utf8");
    output.appendLine(`[harness] score written to ${scorePath}`);
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
      await runTypingPlan(plan, output, token, uris[0].fsPath);
    }
  );
}
