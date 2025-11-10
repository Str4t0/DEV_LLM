// frontend/src/config.ts

// Itt próbáljuk sorban:
// 1) VITE_BACKEND_URL
// 2) VITE_API_BASE_URL (ha régi név maradt a .env-ben)
// 3) fallback: http://127.0.0.1:8000
export const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://127.0.0.1:8000";

console.log("[LLM DEV ENV] BACKEND_URL =", BACKEND_URL);
