// TypeScript wrapper for PL/I WASM Lexer
// This provides a clean API and handles Web Worker communication

export enum TokenType {
  Keyword = 0,
  String = 1,
  Comment = 2,
  Number = 3,
  Operator = 4,
  Preprocessor = 5,
  Builtin = 6,
  Identifier = 7,
  Punctuation = 8,
  Whitespace = 9,
  Newline = 10,
  Unknown = 11,
}

export interface Token {
  text: string;
  type: TokenType;
  start: number;
  end: number;
}

// Token type to CSS class mapping
export const TOKEN_CSS_CLASS: Record<TokenType, string> = {
  [TokenType.Keyword]: 'pli-keyword',
  [TokenType.String]: 'pli-string',
  [TokenType.Comment]: 'pli-comment',
  [TokenType.Number]: 'pli-number',
  [TokenType.Operator]: 'pli-operator',
  [TokenType.Preprocessor]: 'pli-preprocessor',
  [TokenType.Builtin]: 'pli-builtin',
  [TokenType.Identifier]: 'pli-identifier',
  [TokenType.Punctuation]: 'pli-punctuation',
  [TokenType.Whitespace]: 'pli-whitespace',
  [TokenType.Newline]: 'pli-newline',
  [TokenType.Unknown]: 'pli-unknown',
};

/**
 * High-level PL/I Lexer class
 * Handles WASM loading and provides async tokenization
 */
export class PLILexer {
  private wasm: typeof import('./pkg/pli_lexer_wasm') | null = null;
  private worker: Worker | null = null;
  private workerReady = false;
  private pendingRequests = new Map<number, {
    resolve: (tokens: Token[]) => void;
    reject: (error: Error) => void;
  }>();
  private requestId = 0;

  /**
   * Initialize the lexer
   * @param useWorker - If true, run tokenization in Web Worker (non-blocking)
   */
  async init(useWorker = true): Promise<void> {
    if (useWorker) {
      await this.initWorker();
    } else {
      await this.initWasm();
    }
  }

  private async initWasm(): Promise<void> {
    // Dynamic import of WASM module
    this.wasm = await import('./pkg/pli_lexer_wasm');
  }

  private async initWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create inline worker
      const workerCode = `
        let wasm = null;

        self.onmessage = async (e) => {
          const { type, id, code, startByte, endByte } = e.data;

          if (type === 'init') {
            try {
              // Import WASM in worker
              wasm = await import('./pkg/pli_lexer_wasm.js');
              self.postMessage({ type: 'ready' });
            } catch (err) {
              self.postMessage({ type: 'error', error: err.message });
            }
            return;
          }

          if (type === 'tokenize' && wasm) {
            try {
              const flatTokens = wasm.tokenize_flat(code);
              self.postMessage({ type: 'result', id, tokens: flatTokens });
            } catch (err) {
              self.postMessage({ type: 'error', id, error: err.message });
            }
            return;
          }

          if (type === 'tokenizeRange' && wasm) {
            try {
              const flatTokens = wasm.tokenize_range(code, startByte, endByte);
              self.postMessage({ type: 'result', id, tokens: flatTokens });
            } catch (err) {
              self.postMessage({ type: 'error', id, error: err.message });
            }
            return;
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob), { type: 'module' });

      this.worker.onmessage = (e) => {
        const { type, id, tokens, error } = e.data;

        if (type === 'ready') {
          this.workerReady = true;
          resolve();
          return;
        }

        if (type === 'error') {
          if (id !== undefined) {
            const pending = this.pendingRequests.get(id);
            if (pending) {
              pending.reject(new Error(error));
              this.pendingRequests.delete(id);
            }
          } else {
            reject(new Error(error));
          }
          return;
        }

        if (type === 'result') {
          const pending = this.pendingRequests.get(id);
          if (pending) {
            pending.resolve(this.flatToTokens(tokens, ''));
            this.pendingRequests.delete(id);
          }
        }
      };

      this.worker.postMessage({ type: 'init' });
    });
  }

  /**
   * Convert flat array [type, start, end, ...] to Token objects
   */
  private flatToTokens(flat: Uint32Array | number[], code: string): Token[] {
    const tokens: Token[] = [];
    for (let i = 0; i < flat.length; i += 3) {
      const type = flat[i] as TokenType;
      const start = flat[i + 1];
      const end = flat[i + 2];
      tokens.push({
        type,
        start,
        end,
        text: code.slice(start, end),
      });
    }
    return tokens;
  }

  /**
   * Tokenize code synchronously (blocks main thread)
   * Use for small files or when you need immediate results
   */
  tokenizeSync(code: string): Token[] {
    if (!this.wasm) {
      throw new Error('WASM not initialized. Call init(false) first.');
    }
    const flat = this.wasm.tokenize_flat(code);
    return this.flatToTokens(flat, code);
  }

  /**
   * Tokenize code asynchronously (in Web Worker)
   * Use for large files to keep UI responsive
   */
  async tokenize(code: string): Promise<Token[]> {
    if (this.worker && this.workerReady) {
      return this.tokenizeInWorker(code);
    }
    
    // Fallback to sync if worker not available
    if (this.wasm) {
      return this.tokenizeSync(code);
    }

    throw new Error('Lexer not initialized. Call init() first.');
  }

  private tokenizeInWorker(code: string): Promise<Token[]> {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      this.pendingRequests.set(id, { 
        resolve: (tokens) => resolve(tokens),
        reject 
      });
      this.worker!.postMessage({ type: 'tokenize', id, code });
    });
  }

  /**
   * Incremental tokenization - only re-tokenize a range
   * Much faster for editor use cases
   */
  async tokenizeRange(code: string, startByte: number, endByte: number): Promise<Token[]> {
    if (this.worker && this.workerReady) {
      return new Promise((resolve, reject) => {
        const id = this.requestId++;
        this.pendingRequests.set(id, {
          resolve: (tokens) => resolve(tokens),
          reject
        });
        this.worker!.postMessage({ 
          type: 'tokenizeRange', 
          id, 
          code, 
          startByte, 
          endByte 
        });
      });
    }

    if (this.wasm) {
      const flat = this.wasm.tokenize_range(code, startByte, endByte);
      return this.flatToTokens(flat, code);
    }

    throw new Error('Lexer not initialized');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.wasm = null;
    this.pendingRequests.clear();
  }
}

// Singleton instance for easy use
let globalLexer: PLILexer | null = null;

/**
 * Get or create the global lexer instance
 */
export async function getPLILexer(useWorker = true): Promise<PLILexer> {
  if (!globalLexer) {
    globalLexer = new PLILexer();
    await globalLexer.init(useWorker);
  }
  return globalLexer;
}

/**
 * Quick tokenization function (uses global instance)
 */
export async function tokenizePLI(code: string): Promise<Token[]> {
  const lexer = await getPLILexer();
  return lexer.tokenize(code);
}
