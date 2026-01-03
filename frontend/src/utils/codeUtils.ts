// frontend/src/utils/codeUtils.ts

/**
 * PL/I, SAS vagy plain text felismerése fájlnév és tartalom alapján
 */
export function detectCodeLanguage(
  filePath: string, 
  code: string
): "pli" | "sas" | "txt" {
  const lower = (filePath || "").toLowerCase();
  
  // Kiterjesztés alapú detektálás
  if (/\.(pli|pl1)$/i.test(lower)) return "pli";
  if (/\.(sas)$/i.test(lower)) return "sas";

  // Tartalom alapú PL/I detektálás
  const isPli =
    /\bDCL(\s|\()/i.test(code) ||
    /\bDECLARE\b/i.test(code) ||
    /\bPROC(EDURE)?\b/i.test(code) ||
    /\bCALL\b/i.test(code) ||
    /\bONCODE\b/i.test(code) ||
    /\/\*[\s\S]*?\*\//.test(code);

  // Tartalom alapú SAS detektálás
  const isSas =
    /^\s*DATA\b/m.test(code) ||
    /^\s*PROC\b/m.test(code) ||
    /\bRUN\s*;/i.test(code) ||
    /\*[\s\S]*?;\s*$/m.test(code);

  if (isPli && !isSas) return "pli";
  if (isSas && !isPli) return "sas";
  
  // Bizonytalan esetben PL/I preferencia
  return isPli ? "pli" : (isSas ? "sas" : "txt");
}

/**
 * Kódblokkok kinyerése markdown szövegből
 * A LEGNAGYOBB (legtöbb soros) kódblokkot adja vissza - ez általában a módosított kód
 */
export function extractFirstCodeBlock(text: string): string | null {
  const blocks = extractAllCodeBlocks(text);
  if (blocks.length === 0) {
    return null;
  }
  
  if (blocks.length === 1) {
    return blocks[0];
  }
  
  // Több kódblokk esetén: válasszuk a LEGNAGYOBBAT (legtöbb sor)
  // Ez általában a tényleges módosított kód, nem csak egy rövid példa
  console.log(`[extractCodeBlock] ${blocks.length} kódblokk találva, a legnagyobb kiválasztása...`);
  
  let largestBlock = blocks[0];
  let maxLines = blocks[0].split('\n').length;
  
  for (let i = 1; i < blocks.length; i++) {
    const lines = blocks[i].split('\n').length;
    if (lines > maxLines) {
      maxLines = lines;
      largestBlock = blocks[i];
    }
  }
  
  console.log(`[extractCodeBlock] Kiválasztott blokk: ${maxLines} sor, kezdet: "${largestBlock.substring(0, 50)}..."`);
  
  return largestBlock;
}

/**
 * Összes kódblokk kinyerése markdown szövegből
 * Visszaadja az összes kódblokkot sorrendben
 */
export function extractAllCodeBlocks(text: string): string[] {
  const codeBlockRegex = /```[a-zA-Z0-9]*\s*\n?([\s\S]*?)```/g;
  const blocks: string[] = [];
  
  let match;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const content = match[1].trim();
    if (content.length > 5) {
      blocks.push(content);
    }
  }
  
  return blocks;
}