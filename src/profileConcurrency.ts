import { cfg } from "./config";
import { defaultMaxConcurrent, LlmProfileConfig } from "./profiles";
import { Semaphore } from "./semaphore";

/** One async request pool per LLM profile (not OS threads). */
export class ProfileConcurrency {
  private readonly pools = new Map<string, Semaphore>();

  maxFor(profile: LlmProfileConfig): number {
    if (profile.maxConcurrent !== undefined && profile.maxConcurrent > 0) {
      return Math.floor(profile.maxConcurrent);
    }
    return defaultMaxConcurrent(profile);
  }

  maxForId(profileId: string): number {
    const profile = cfg().profiles.find((p) => p.id === profileId);
    return profile ? this.maxFor(profile) : 2;
  }

  async run<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
    const limit = this.maxForId(profileId);
    let pool = this.pools.get(profileId);
    if (!pool) {
      pool = new Semaphore(limit);
      this.pools.set(profileId, pool);
    }
    return pool.use(fn);
  }
}
