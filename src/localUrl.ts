/** True for localhost / loopback / *.local hosts. */
export function isLocalBaseUrl(baseUrl: string): boolean {
  if (!baseUrl.trim()) {
    return false;
  }
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local")
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(baseUrl);
  }
}

export const LOCAL_DEFAULT_TIMEOUT_MS = 60_000;
export const CLOUD_DEFAULT_TIMEOUT_MS = 5_000;
