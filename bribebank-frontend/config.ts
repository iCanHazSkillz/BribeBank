// bribebank-frontend/config.ts

// Read the API URL from Vite's env variables.
// In Docker / production this will be https://api.bribebank.homeflixlab.com
// In dev you can override it via VITE_API_URL=http://localhost:3040
export const API_BASE =
  import.meta.env.VITE_API_URL || "https://api.bribebank.homeflixlab.com";
