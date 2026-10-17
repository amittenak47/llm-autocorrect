import * as vscode from "vscode";
import { shouldSkipSecretTarget } from "./privacySettings";
import { anySignal } from "./abortSignals";
import { activeLlmProfile, cfg } from "./config";
import {
  buildGuardianJudgeUserMessage,
  GuardianRejectedError,
  parseGuardianScore,
} from "./guardianJudge";
import { CLOUD_DEFAULT_TIMEOUT_MS, LOCAL_DEFAULT_TIMEOUT_MS, isLocalBaseUrl } from "./localUrl";
import { LlmClient } from "./llm";
import { capMaxTokens } from "./promptLimits";
import { effectiveProfileTimeout, LlmProfileConfig } from "./profiles";
import { ProfileConcurrency } from "./profileConcurrency";

export type CompleteKind = "fix" | "paste" | "raw";

export interface RoutedRequest {
  system: string;
  user: string;
  maxTokens: number;
  signal: AbortSignal;
  profileId?: string;
  /** What to judge against (TARGET / SOURCE). Required when kind is fix|paste and guardian is on. */
  judgeOriginal?: string;
  kind?: CompleteKind;
}

export { GuardianRejectedError };

export class LlmRouter {
  private output?: vscode.OutputChannel;

  constructor(
    private readonly client: LlmClient,
    private readonly concurrency: ProfileConcurrency
  ) {}

  setOutput(output: vscode.OutputChannel): void {
    this.output = output;
  }

  get activeProfile(): LlmProfileConfig {
    return activeLlmProfile();
  }

  listProfiles(): LlmProfileConfig[] {
    return cfg().profiles;
  }

  profileById(id: string): LlmProfileConfig | undefined {
    return cfg().profiles.find((p) => p.id === id);
  }

  cycleProfile(delta: number): LlmProfileConfig {
    const profiles = cfg().profiles;
    const current = profiles.findIndex((p) => p.id === cfg().activeProfile);
    const next = (current + delta + profiles.length) % profiles.length;
    return profiles[next];
  }

  async complete(req: RoutedRequest): Promise<string> {
    const profile = req.profileId
      ? this.profileById(req.profileId) ?? this.activeProfile
      : this.activeProfile;
    return this.completeWithOptionalJudge(profile, req);
  }

  private async completeWithOptionalJudge(
    profile: LlmProfileConfig,
    req: RoutedRequest
  ): Promise<string> {
    const kind = req.kind ?? "raw";
    const c = cfg();
    const judgeOn =
      c.guardianEnabled && (kind === "fix" || kind === "paste") && !!req.judgeOriginal?.trim();

    let attempt = 0;
    const maxAttempts = judgeOn ? 1 + Math.max(0, c.guardianMaxRetries) : 1;
    let last = "";

    while (attempt < maxAttempts) {
      attempt++;
      const user =
        attempt > 1
          ? `${req.user}\n\n(Previous reply was rejected as unfaithful — reply with ONLY a minimal correction of the TARGET/SOURCE.)`
          : req.user;
      last = await this.concurrency.run(profile.id, () => this.completeForProfile(profile, { ...req, user }));

      if (!judgeOn) {
        return last;
      }

      const score = await this.judge(req.judgeOriginal!, last, req.signal);
      this.output?.appendLine(
        `[guardian] attempt ${attempt}/${maxAttempts} → ${score ?? "unparsed"}`
      );
      if (score === "yes") {
        return last;
      }
      if (score === undefined) {
        this.output?.appendLine(
          `[guardian] could not parse score — accepting candidate`
        );
        this.output?.appendLine(`[guardian] candidate:\n${last.slice(0, 800)}`);
        return last;
      }
      this.output?.appendLine(`[guardian] rejected candidate:\n${last.slice(0, 1200)}`);
    }

    throw new GuardianRejectedError(last, `Guardian rejected after ${maxAttempts} attempt(s)`);
  }

  private async judge(
    original: string,
    candidate: string,
    signal: AbortSignal
  ): Promise<"yes" | "no" | undefined> {
    const c = cfg();
    const gProfile = this.profileById(c.guardianProfileId);
    if (!gProfile) {
      this.output?.appendLine(
        `[guardian] profile "${c.guardianProfileId}" missing — skipping judge`
      );
      return "yes";
    }
    if (shouldSkipSecretTarget(original, gProfile, c.skipSecretTargetsForCloud)) {
      this.output?.appendLine("[guardian] skipped cloud judge: original contains a secret — accepting candidate");
      return "yes";
    }
    const user = buildGuardianJudgeUserMessage({ original, candidate });
    const timeoutMs = this.resolveTimeout(gProfile);
    const gSignal = anySignal([signal, AbortSignal.timeout(timeoutMs)]);
    try {
      const raw = await this.concurrency.run(gProfile.id, () =>
        this.client.completeForProfile(gProfile, {
          system:
            "You are Granite Guardian. Judge ASSISTANT_REPLY against the criteria strictly. " +
            "Prefer 'no' when unsure. Output only the requested score format.",
          user,
          maxTokens: 128,
          signal: gSignal,
        })
      );
      return parseGuardianScore(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output?.appendLine(`[guardian] judge failed — ${msg} (accepting candidate)`);
      return "yes";
    }
  }

  private async completeForProfile(profile: LlmProfileConfig, req: RoutedRequest): Promise<string> {
    const timeoutMs = this.resolveTimeout(profile);
    const signal = anySignal([req.signal, AbortSignal.timeout(timeoutMs)]);
    const maxTokens = capMaxTokens(profile.provider, req.maxTokens, req.system, req.user);
    return this.client.completeForProfile(profile, { ...req, maxTokens, signal });
  }

  resolveTimeout(profile: LlmProfileConfig): number {
    return effectiveProfileTimeout(profile, cfg().timeoutMs);
  }

  isLocalProfile(profile: LlmProfileConfig): boolean {
    return profile.provider === "openai-compatible" && isLocalBaseUrl(profile.baseUrl ?? "");
  }
}

export function defaultTimeoutForBaseUrl(baseUrl: string, globalMs: number): number {
  if (globalMs > 0) {
    return globalMs;
  }
  return isLocalBaseUrl(baseUrl) ? LOCAL_DEFAULT_TIMEOUT_MS : CLOUD_DEFAULT_TIMEOUT_MS;
}
