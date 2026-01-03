// frontend/src/config.ts

// Backend URL meghatározása:
// 1) VITE_BACKEND_URL környezeti változó
// 2) VITE_API_BASE_URL (régi név)
// 3) fallback: http://127.0.0.1:5172
export const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://127.0.0.1:5172";

console.log("[LLM DEV ENV] BACKEND_URL =", BACKEND_URL);
