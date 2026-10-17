import * as vscode from "vscode";
import { invalidateConfigCache } from "./config";
import { migrateSeededProfiles } from "./profileMigration";
import { PACKAGE_DEFAULT_PROFILES_V0_3, SEEDED_PROFILES_V0_3 } from "./seededProfiles";

const STATE_KEY = "autocorrect.profilesMigrated.v1";

export async function maybeMigrateSeededProfiles(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel
): Promise<void> {
  if (context.globalState.get<boolean>(STATE_KEY)) return;
  // Runs during activation: a failed settings write must not stop the extension from loading.
  try {
    const config = vscode.workspace.getConfiguration("autocorrect");
    const stored = config.inspect<unknown[]>("profiles")?.globalValue;
    if (Array.isArray(stored) && stored.length > 0) {
      const result = migrateSeededProfiles(stored, [SEEDED_PROFILES_V0_3, PACKAGE_DEFAULT_PROFILES_V0_3]);
      await config.update("profiles", result.profiles.length > 0 ? result.profiles : undefined, vscode.ConfigurationTarget.Global);
      invalidateConfigCache();
      output.appendLine(`[onboard] profiles: removed ${result.dropped.length} unchanged built-in copies, kept overrides for ${result.trimmed.join(", ") || "none"}`);
    }
    await context.globalState.update(STATE_KEY, true);
  } catch (err) {
    output.appendLine(`[onboard] profile migration skipped — ${err instanceof Error ? err.message : String(err)}`);
  }
}
