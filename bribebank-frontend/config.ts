// bribebank-frontend/config.ts

// API base URL is provided by Vite at build time.
// In production: injected via docker-compose → VITE_API_URL
// In development: can be overridden manually via .env or defaults to localhost.
export const API_BASE =
  import.meta?.env?.VITE_API_URL || "http://localhost:3040";

// Helper used everywhere to construct endpoint URLs.
export const apiUrl = (path: string) => `${API_BASE}${path}`;
