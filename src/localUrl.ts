/** True for localhost / loopback / *.local hosts. */
export function isLocalBaseUrl(baseUrl: string): boolean {
  if (!baseUrl.trim()) {
    return false;
  }
  try {
    const host = new URL(baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      host === "localhost" ||
      host === "0.0.0.0" ||
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(baseUrl);
  }
}

export const LOCAL_DEFAULT_TIMEOUT_MS = 60_000;
export const CLOUD_DEFAULT_TIMEOUT_MS = 5_000;
