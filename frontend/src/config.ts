// frontend/src/config.ts

// Backend URL meghatározása:
// 1) VITE_BACKEND_URL környezeti változó
// 2) VITE_API_BASE_URL (régi név)
// 3) AUTO-DETECT: Ugyanaz a host ahonnan a frontend töltődött (mobilhoz!)
// 4) fallback: http://127.0.0.1:5172

function getBackendUrl(): string {
  // Explicit env var
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // Auto-detect: használjuk ugyanazt a host-ot ahol a frontend fut
  // Ez lehetővé teszi a mobil elérést!
  const currentHost = window.location.hostname;
  
  // Ha localhost/127.0.0.1, maradunk ott
  if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
    return 'http://127.0.0.1:5172';
  }
  
  // Egyébként (pl. 192.168.x.x) használjuk azt a host-ot
  return `http://${currentHost}:5172`;
}

export const BACKEND_URL = getBackendUrl();

console.log("[LLM DEV ENV] BACKEND_URL =", BACKEND_URL);
console.log("[LLM DEV ENV] Host:", window.location.hostname);
