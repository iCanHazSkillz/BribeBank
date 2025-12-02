// API base URL is provided by Vite at build time.
export const API_BASE =
  import.meta.env.VITE_API_URL

// Helper used everywhere to construct endpoint URLs.
export const apiUrl = (path: string) => `${API_BASE}${path}`;
