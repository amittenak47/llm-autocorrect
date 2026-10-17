import * as vscode from "vscode";
import { cfg } from "./config";
import { matchesAny } from "./globMatch";
import { LlmProfileConfig } from "./profiles";
import { shouldSkipSecretTarget } from "./privacySettings";

export function isExcludedDocument(doc: vscode.TextDocument): boolean {
  return matchesAny(doc.uri.scheme === "file" ? doc.uri.fsPath : doc.uri.path, cfg().excludeGlobs);
}

export function skipExcludedDocument(doc: vscode.TextDocument): boolean {
  if (!isExcludedDocument(doc)) return false;
  vscode.window.setStatusBarMessage("Autocorrect: skipped — file matches autocorrect.context.excludeGlobs", 5000);
  return true;
}

export function skipSecretTarget(text: string, profile: LlmProfileConfig): boolean {
  if (!shouldSkipSecretTarget(text, profile, cfg().skipSecretTargetsForCloud)) return false;
  vscode.window.setStatusBarMessage("Autocorrect: skipped — text looks like it contains a secret (cloud profile)", 5000);
  return true;
}
