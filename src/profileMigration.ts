import { DEFAULT_PROFILES, LlmProfileConfig } from "./profiles";

export function migrateSeededProfiles(
  stored: unknown[],
  seededSnapshots: LlmProfileConfig[][]
): { profiles: unknown[]; dropped: string[]; trimmed: string[] } {
  const profiles: unknown[] = [];
  const dropped: string[] = [];
  const trimmed: string[] = [];
  for (const entry of stored) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      profiles.push(entry);
      continue;
    }
    const record = entry as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "string" || !DEFAULT_PROFILES.some((p) => p.id === id)) {
      profiles.push(entry);
      continue;
    }
    let best: string[] | undefined;
    for (const snapshot of seededSnapshots) {
      const profile = snapshot.find((p) => p.id === id);
      if (!profile) continue;
      const baseline = profile as unknown as Record<string, unknown>;
      const differing = Object.keys(record).filter((key) => key !== "id" &&
        JSON.stringify(record[key]) !== JSON.stringify(baseline[key]));
      if (!best || differing.length < best.length) best = differing;
    }
    if (!best) {
      profiles.push(entry);
    } else if (best.length === 0) {
      dropped.push(id);
    } else {
      const override: Record<string, unknown> = { id };
      for (const key of best) override[key] = record[key];
      profiles.push(override);
      trimmed.push(id);
    }
  }
  return { profiles, dropped, trimmed };
}
