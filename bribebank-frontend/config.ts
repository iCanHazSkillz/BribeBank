const isLoopbackHost = (host: string): boolean =>
  host === "localhost" || host === "127.0.0.1" || host === "[::1]";

const normalizeBase = (value: string): string => value.replace(/\/+$/, "");

const selectApiBase = (raw: string | undefined): string => {
  const candidates = (raw || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (candidates.length === 0) return "";
  if (candidates.length === 1) return normalizeBase(candidates[0]);

  const currentHost = window.location.hostname;

  const parsed = candidates
    .map((candidate) => {
      try {
        const url = new URL(candidate);
        return { base: normalizeBase(candidate), host: url.hostname };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { base: string; host: string } => !!entry);

  if (parsed.length === 0) return normalizeBase(candidates[0]);

  if (isLoopbackHost(currentHost)) {
    const loopbackMatch = parsed.find((entry) => isLoopbackHost(entry.host));
    if (loopbackMatch) return loopbackMatch.base;
  } else {
    const hostMatch = parsed.find((entry) => entry.host === currentHost);
    if (hostMatch) return hostMatch.base;
  }

  return parsed[0].base;
};

// Supports one URL or comma-separated URLs in VITE_API_URL.
export const API_BASE = selectApiBase(import.meta.env.VITE_API_URL);

// Helper used everywhere to construct endpoint URLs.
export const apiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE) return normalizedPath;
  return `${API_BASE}${normalizedPath}`;
};
