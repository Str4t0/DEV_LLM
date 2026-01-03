// frontend/src/workers/pliLexerWorker.ts
// Web Worker a WASM tokenizáláshoz - nem blokkolja a main thread-et

import init, { tokenize_flat, version } from '../pli-lexer-wasm/pkg/pli_lexer_wasm.js';

// Worker állapot
let isInitialized = false;

// Üzenet típusok
interface InitMessage {
  type: 'init';
}

interface TokenizeMessage {
  type: 'tokenize';
  id: number;
  code: string;
}

interface TokenizeRangeMessage {
  type: 'tokenizeRange';
  id: number;
  code: string;
  startLine: number;
  endLine: number;
}

type WorkerMessage = InitMessage | TokenizeMessage | TokenizeRangeMessage;

// Válasz típusok
interface ReadyResponse {
  type: 'ready';
  version: string;
}

interface TokensResponse {
  type: 'tokens';
  id: number;
  tokens: Uint32Array;
  duration: number;
}

interface ErrorResponse {
  type: 'error';
  id?: number;
  error: string;
}

type WorkerResponse = ReadyResponse | TokensResponse | ErrorResponse;

// Üzenet kezelő
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const message = e.data;

  switch (message.type) {
    case 'init':
      await handleInit();
      break;
    
    case 'tokenize':
      handleTokenize(message.id, message.code);
      break;
    
    case 'tokenizeRange':
      handleTokenizeRange(message.id, message.code, message.startLine, message.endLine);
      break;
  }
};

// WASM inicializálás
async function handleInit(): Promise<void> {
  if (isInitialized) {
    self.postMessage({ type: 'ready', version: version() } as ReadyResponse);
    return;
  }

  try {
    await init();
    isInitialized = true;
    self.postMessage({ type: 'ready', version: version() } as ReadyResponse);
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: `WASM init failed: ${error}` 
    } as ErrorResponse);
  }
}

// Teljes kód tokenizálása
function handleTokenize(id: number, code: string): void {
  if (!isInitialized) {
    self.postMessage({ 
      type: 'error', 
      id, 
      error: 'Worker not initialized' 
    } as ErrorResponse);
    return;
  }

  try {
    const start = performance.now();
    const tokens = tokenize_flat(code);
    const duration = performance.now() - start;

    self.postMessage({ 
      type: 'tokens', 
      id, 
      tokens, 
      duration 
    } as TokensResponse);
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      id, 
      error: `Tokenize failed: ${error}` 
    } as ErrorResponse);
  }
}

// Sor tartomány tokenizálása (viewport-based)
function handleTokenizeRange(
  id: number, 
  code: string, 
  startLine: number, 
  endLine: number
): void {
  if (!isInitialized) {
    self.postMessage({ 
      type: 'error', 
      id, 
      error: 'Worker not initialized' 
    } as ErrorResponse);
    return;
  }

  try {
    const start = performance.now();
    
    // Sorok kinyerése
    const lines = code.split('\n');
    const safeStart = Math.max(0, Math.min(startLine, lines.length));
    const safeEnd = Math.max(0, Math.min(endLine, lines.length));
    
    // Csak a kért tartományt tokenizáljuk
    const rangeCode = lines.slice(safeStart, safeEnd).join('\n');
    const tokens = tokenize_flat(rangeCode);
    
    const duration = performance.now() - start;

    // Offset információval küldjük vissza
    self.postMessage({ 
      type: 'tokens', 
      id, 
      tokens, 
      duration,
      // @ts-ignore - extra adat
      startLine: safeStart,
      endLine: safeEnd,
    } as TokensResponse);
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      id, 
      error: `TokenizeRange failed: ${error}` 
    } as ErrorResponse);
  }
}

// TypeScript worker típus export
export type { WorkerMessage, WorkerResponse };
