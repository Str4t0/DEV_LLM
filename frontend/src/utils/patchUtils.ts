// frontend/src/utils/patchUtils.ts
// Közös patch alkalmazási logika - AUTO és MANUAL mód ugyanazt használja

import type { SuggestedPatch } from "../types";
import { resolvePathFromTree } from "./fileUtils";
import type { FileNode } from "../types";

/**
 * Ékezetek és double-encoded UTF-8 karakterek normalizálása összehasonlításhoz
 */
export function normalizeForCompare(str: string): string {
  return str
    // Double-encoded UTF-8 patterns (gyakori Windows/Latin1 hibák)
    .replace(/á/g, 'a').replace(/é/g, 'e').replace(/í/g, 'i')
    .replace(/ó/g, 'o').replace(/ö/g, 'o').replace(/ő/g, 'o')
    .replace(/ú/g, 'u').replace(/ü/g, 'u').replace(/ű/g, 'u')
    .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I')
    .replace(/Ó/g, 'O').replace(/Ö/g, 'O').replace(/Ő/g, 'O')
    .replace(/Ú/g, 'U').replace(/Ü/g, 'U').replace(/Ű/g, 'U')
    // Normal ékezetek eltávolítása
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[áàâäãå]/gi, 'a')
    .replace(/[éèêë]/gi, 'e')
    .replace(/[íìîï]/gi, 'i')
    .replace(/[óòôöõő]/gi, 'o')
    .replace(/[úùûüű]/gi, 'u')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Patch alkalmazás eredménye
 */
export interface PatchResult {
  success: boolean;
  resolvedPath: string | null;
  error?: string;
  matchType?: 'exact' | 'whitespace' | 'fuzzy' | 'already_modified' | 'none';
  originalLines: number;
  modifiedLines: number;
  newContent?: string;
  alreadyModified?: boolean; // Ha a fájl már tartalmazza a módosított kódot
}

/**
 * Egyedi ID generálása (key collision elkerülése)
 * Kombináljuk: timestamp + counter + random
 */
let idCounter = 0;
let lastTimestamp = 0;
export function generateUniqueId(): number {
  const now = Date.now();
  
  // Ha ugyanabban a milliszekundumban vagyunk, növeljük a countert
  if (now === lastTimestamp) {
    idCounter++;
  } else {
    lastTimestamp = now;
    idCounter = 0;
  }
  
  // Random komponens hozzáadása a nagyobb biztonság érdekében
  const random = Math.floor(Math.random() * 1000);
  
  // Struktúra: timestamp * 1_000_000 + counter * 1000 + random
  return now * 1000000 + (idCounter % 1000) * 1000 + random;
}

/**
 * BOM és whitespace tisztítása
 */
function cleanContent(str: string): string {
  return str.replace(/^\uFEFF/, ''); // UTF-8 BOM eltávolítása
}

/**
 * Patch alkalmazása fájl tartalomra
 * UGYANAZ a logika AUTO és MANUAL módban!
 */
export function applyPatchToContent(
  fileContent: string,
  patch: SuggestedPatch
): { success: boolean; newContent: string; matchType: 'exact' | 'whitespace' | 'fuzzy' | 'already_modified' | 'none'; alreadyModified?: boolean } {
  
  // BOM eltávolítása mindkét oldalról
  const cleanedContent = cleanContent(fileContent);
  const cleanedOriginal = cleanContent(patch.original);
  const cleanedModified = cleanContent(patch.modified);
  
  // 1. PONTOS EGYEZÉS (BOM-mentes)
  if (cleanedContent.includes(cleanedOriginal)) {
    const occurrences = cleanedContent.split(cleanedOriginal).length - 1;
    if (occurrences >= 1) {
      return {
        success: true,
        newContent: cleanedContent.replace(cleanedOriginal, cleanedModified),
        matchType: 'exact'
      };
    }
  }
  
  // 2. WHITESPACE-TOLERÁNS
  const trimmedOriginal = cleanedOriginal.trim();
  if (trimmedOriginal && cleanedContent.includes(trimmedOriginal)) {
    return {
      success: true,
      newContent: cleanedContent.replace(trimmedOriginal, cleanedModified.trim()),
      matchType: 'whitespace'
    };
  }
  
  // 3. ÉKEZET-TOLERÁNS (fuzzy) - soronkénti összehasonlítás
  const originalLines = cleanedOriginal.split('\n');
  const fileLines = cleanedContent.split('\n');
  
  if (originalLines.length > 0 && originalLines[0].trim()) {
    const normalizedFirstLine = normalizeForCompare(originalLines[0]);
    
    for (let i = 0; i < fileLines.length; i++) {
      if (normalizeForCompare(fileLines[i]) === normalizedFirstLine) {
        // Ellenőrizzük a többi sort is
        let allMatch = true;
        for (let j = 1; j < originalLines.length && i + j < fileLines.length; j++) {
          if (normalizeForCompare(fileLines[i + j]) !== normalizeForCompare(originalLines[j])) {
            allMatch = false;
            break;
          }
        }
        
        if (allMatch) {
          // Megtaláltuk - cseréljük ki a sorokat
          const newLines = [...fileLines];
          newLines.splice(i, originalLines.length, ...cleanedModified.split('\n'));
          return {
            success: true,
            newContent: newLines.join('\n'),
            matchType: 'fuzzy'
          };
        }
      }
    }
  }
  
  // 3.5 PLACEHOLDER KEZELÉS - Ha az LLM "// ..." placeholdert használ
  // Csak az első sort és az utolsó nem-placeholder sort keressük
  const hasPlaceholder = originalLines.some(line => line.trim() === '// ...' || line.trim() === '...');
  if (hasPlaceholder && originalLines.length >= 2) {
    console.log("[PATCH] 🔍 Placeholder detektálva, smart matching...");
    
    // Keressük az első valódi (nem placeholder) sort
    const firstRealLine = originalLines.find(line => line.trim() && line.trim() !== '// ...' && line.trim() !== '...');
    // Keressük az utolsó valódi sort
    const lastRealLine = [...originalLines].reverse().find(line => line.trim() && line.trim() !== '// ...' && line.trim() !== '...');
    
    if (firstRealLine) {
      const normalizedFirst = normalizeForCompare(firstRealLine);
      
      for (let i = 0; i < fileLines.length; i++) {
        if (normalizeForCompare(fileLines[i]) === normalizedFirst) {
          // Megtaláltuk az első sort - keressük az utolsót is
          let endIndex = i + 1;
          
          if (lastRealLine && lastRealLine !== firstRealLine) {
            const normalizedLast = normalizeForCompare(lastRealLine);
            // Keressük az utolsó sort a fájlban (max 50 sorral távolabb)
            for (let k = i + 1; k < Math.min(i + 50, fileLines.length); k++) {
              if (normalizeForCompare(fileLines[k]) === normalizedLast) {
                endIndex = k + 1;
                break;
              }
            }
          }
          
          // Cseréljük ki az egész blokkot
          console.log(`[PATCH] ✓ Placeholder match: sor ${i+1} - ${endIndex}`);
          const newLines = [...fileLines];
          newLines.splice(i, endIndex - i, ...cleanedModified.split('\n'));
          return {
            success: true,
            newContent: newLines.join('\n'),
            matchType: 'fuzzy'
          };
        }
      }
    }
  }
  
  // 3.6 CSAK ELSŐ SOR EGYEZÉS - Ha az első sor egyezik, cseréljük ki azt a részt
  // Ez hasznos amikor az LLM csak a kommentet módosítja
  if (originalLines.length >= 1) {
    const firstLine = originalLines[0].trim();
    if (firstLine && !firstLine.includes('// ...')) {
      const normalizedFirst = normalizeForCompare(firstLine);
      
      for (let i = 0; i < fileLines.length; i++) {
        if (normalizeForCompare(fileLines[i]) === normalizedFirst) {
          // Megtaláltuk az első sort - keressük meddig egyezik
          let matchLength = 1;
          for (let j = 1; j < originalLines.length && i + j < fileLines.length; j++) {
            const origLine = originalLines[j].trim();
            // Ha placeholder vagy üres, skipeljük
            if (!origLine || origLine === '// ...' || origLine === '...') {
              continue;
            }
            if (normalizeForCompare(fileLines[i + j]) === normalizeForCompare(origLine)) {
              matchLength = j + 1;
            } else {
              break;
            }
          }
          
          // Ha legalább az első sor egyezik, és a modified hasonló struktúrájú
          const modifiedLines = cleanedModified.split('\n');
          if (matchLength >= 1 && modifiedLines.length >= 1) {
            console.log(`[PATCH] ✓ Partial match: sor ${i+1}, ${matchLength} sor egyezik`);
            const newLines = [...fileLines];
            // Cseréljük ki annyi sort amennyit a modified tartalmaz
            newLines.splice(i, Math.max(matchLength, modifiedLines.length), ...modifiedLines);
            return {
              success: true,
              newContent: newLines.join('\n'),
              matchType: 'fuzzy'
            };
          }
        }
      }
    }
  }
  
  // 3.7 UTOLSÓ MENTSVÁR - Csak a komment sort cseréljük, ha az egyezik
  // Ez kezeli azt az esetet amikor az LLM rosszul emlékszik a kód struktúrára
  const firstOrigLine = originalLines[0]?.trim() || '';
  const firstModLine = cleanedModified.split('\n')[0]?.trim() || '';
  
  // Ha mindkettő komment és az első sor egyezik (normalizálva)
  if (firstOrigLine.startsWith('//') && firstModLine.startsWith('//')) {
    const normalizedFirstOrig = normalizeForCompare(firstOrigLine);
    
    for (let i = 0; i < fileLines.length; i++) {
      if (normalizeForCompare(fileLines[i].trim()) === normalizedFirstOrig) {
        console.log(`[PATCH] ✓ Comment-only match: sor ${i+1}`);
        // Csak az egy sort cseréljük
        const newLines = [...fileLines];
        // Megtartjuk az eredeti indentációt
        const indent = fileLines[i].match(/^(\s*)/)?.[1] || '';
        newLines[i] = indent + firstModLine;
        return {
          success: true,
          newContent: newLines.join('\n'),
          matchType: 'fuzzy'
        };
      }
    }
  }
  
  // 4. NEM TALÁLTUK - részletes log
  // MEGJEGYZÉS: "Already modified" ellenőrzés KIKAPCSOLVA mert túl sok false positive-ot okoz
  console.log("[PATCH] ❌ Eredeti kód NEM található!");
  console.log("[PATCH] ❌ ORIGINAL első 200 karakter:", cleanedOriginal.substring(0, 200));
  console.log("[PATCH] ❌ FÁJL első 500 karakter:", cleanedContent.substring(0, 500));
  
  // Extra debug: Keressük az első sor egyezését
  const firstOriginalLine = cleanedOriginal.split('\n')[0].trim();
  const debugFileLines = cleanedContent.split('\n');
  const matchingLineIndex = debugFileLines.findIndex(line => line.trim() === firstOriginalLine);
  if (matchingLineIndex >= 0) {
    console.log(`[PATCH] ❌ Első sor MEGTALÁLVA a ${matchingLineIndex}. sorban, de a többi nem egyezik!`);
    console.log("[PATCH] ❌ Fájl tartalom ott:", debugFileLines.slice(matchingLineIndex, matchingLineIndex + 5).join('\n'));
  } else {
    console.log("[PATCH] ❌ Még az első sor sem található:", firstOriginalLine);
  }
  
  return {
    success: false,
    newContent: cleanedContent,
    matchType: 'none'
  };
}

/**
 * Teljes patch folyamat: path feloldás + fájl betöltés + alkalmazás + mentés
 * 
 * FONTOS: Ha editorContent-et adunk meg, azt használja a lemez helyett!
 * Az LLM a sourceCode-ot látja, ezért a patch-et is arra kell alkalmazni!
 */
export async function applyPatch(
  patch: SuggestedPatch,
  projectId: number,
  filesTree: FileNode[] | null,
  backendUrl: string,
  editorContent?: string,  // Az editor aktuális tartalma (amit az LLM is kapott!)
  currentFilePath?: string // Az editorban nyitott fájl path-ja
): Promise<PatchResult> {
  
  // 1. Path feloldás
  const resolvedPath = filesTree 
    ? resolvePathFromTree(patch.filePath, filesTree) 
    : patch.filePath;
  
  if (!resolvedPath) {
    return {
      success: false,
      resolvedPath: null,
      error: `Fájl nem található a projektben: ${patch.filePath}`,
      matchType: 'none',
      originalLines: patch.original.split('\n').length,
      modifiedLines: patch.modified.split('\n').length
    };
  }
  
  console.log(`[PATCH] ${patch.filePath} → Resolved: ${resolvedPath}`);
  
  // 2. Fájl tartalom meghatározása
  // FONTOS: Ha az editor tartalmat kaptunk ÉS ez a patch fájlja, azt használjuk!
  let fileContent: string;
  let useEditorContent = false;
  
  // Ellenőrizzük, hogy az editor tartalmat használjuk-e
  if (editorContent !== undefined && currentFilePath) {
    // Normalize paths for comparison
    const normalizedResolved = resolvedPath.replace(/\\/g, '/').toLowerCase();
    const normalizedCurrent = currentFilePath.replace(/\\/g, '/').toLowerCase();
    
    // Get just the filename for comparison
    const resolvedFileName = normalizedResolved.split('/').pop() || normalizedResolved;
    const currentFileName = normalizedCurrent.split('/').pop() || normalizedCurrent;
    
    console.log(`[PATCH] Path összehasonlítás:`, {
      resolvedPath: normalizedResolved,
      currentPath: normalizedCurrent,
      resolvedFileName,
      currentFileName,
      editorContentLength: editorContent.length
    });
    
    // Check if it's the same file (filename match is enough since we have the editor content)
    if (normalizedResolved === normalizedCurrent || 
        resolvedFileName === currentFileName) {
      fileContent = cleanContent(editorContent);
      useEditorContent = true;
      console.log(`[PATCH] ✓ Editor tartalom használata (${fileContent.length} byte)`);
    } else {
      console.log(`[PATCH] ⚠️ Path nem egyezik, lemezről töltjük`);
    }
  } else {
    console.log(`[PATCH] ⚠️ Nincs editor content (${editorContent?.length ?? 'undefined'}) vagy currentFilePath (${currentFilePath})`);
  }
  
  // Ha nem az editor tartalmat használjuk, töltjük a lemezről
  if (!useEditorContent) {
    try {
      const loadRes = await fetch(`${backendUrl}/projects/${projectId}/file?rel_path=${encodeURIComponent(resolvedPath)}`);
      
      if (!loadRes.ok) {
        return {
          success: false,
          resolvedPath,
          error: `Fájl nem tölthető be: ${resolvedPath}`,
          matchType: 'none',
          originalLines: patch.original.split('\n').length,
          modifiedLines: patch.modified.split('\n').length
        };
      }
      
      const loadData = await loadRes.json();
      fileContent = cleanContent(loadData.content || "");
      console.log(`[PATCH] Lemezről töltve (${fileContent.length} byte)`);
    } catch (err) {
      console.error("[PATCH] Betöltési hiba:", err);
      return {
        success: false,
        resolvedPath,
        error: `Hiba: ${err}`,
        matchType: 'none',
        originalLines: patch.original.split('\n').length,
        modifiedLines: patch.modified.split('\n').length
      };
    }
  }
  
  // 3. Patch alkalmazása
  const patchResult = applyPatchToContent(fileContent, patch);
  
  if (!patchResult.success) {
    console.log("[PATCH] ❌ Keresett eredeti kód:", patch.original.substring(0, 200));
    console.log("[PATCH] ❌ Fájl első 400 karakter:", fileContent.substring(0, 400));
    console.log("[PATCH] ❌ Forrás:", useEditorContent ? "EDITOR" : "LEMEZ");
    
    return {
      success: false,
      resolvedPath,
      error: `Eredeti kód nem található`,
      matchType: 'none',
      originalLines: patch.original.split('\n').length,
      modifiedLines: patch.modified.split('\n').length
    };
  }
  
  // Ha már módosítva van, nem kell újra menteni!
  if (patchResult.alreadyModified) {
    console.log(`[PATCH] ✓ ${resolvedPath} már módosítva volt - kihagyva`);
    return {
      success: true,
      resolvedPath,
      matchType: 'already_modified',
      originalLines: patch.original.split('\n').length,
      modifiedLines: patch.modified.split('\n').length,
      newContent: patchResult.newContent,
      alreadyModified: true
    };
  }
  
  // 4. Mentés
  try {
    const saveRes = await fetch(`${backendUrl}/projects/${projectId}/file/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rel_path: resolvedPath,
        content: patchResult.newContent,
        encoding: "utf-8",
      }),
    });
    
    if (!saveRes.ok) {
      return {
        success: false,
        resolvedPath,
        error: `Mentési hiba`,
        matchType: patchResult.matchType,
        originalLines: patch.original.split('\n').length,
        modifiedLines: patch.modified.split('\n').length
      };
    }
    
    console.log(`[PATCH] ✅ ${resolvedPath} mentve (${patchResult.matchType})`);
    
    return {
      success: true,
      resolvedPath,
      matchType: patchResult.matchType,
      originalLines: patch.original.split('\n').length,
      modifiedLines: patch.modified.split('\n').length,
      newContent: patchResult.newContent
    };
    
  } catch (err) {
    console.error("[PATCH] Mentési hiba:", err);
    return {
      success: false,
      resolvedPath,
      error: `Hiba: ${err}`,
      matchType: 'none',
      originalLines: patch.original.split('\n').length,
      modifiedLines: patch.modified.split('\n').length
    };
  }
}

/**
 * Módosítás összefoglaló formázása chat üzenethez
 */
export function formatPatchSummary(
  results: PatchResult[],
  patches: SuggestedPatch[],
  isAutoMode: boolean
): string {
  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;
  const alreadyModifiedCount = results.filter(r => r.alreadyModified).length;
  const actuallyChangedCount = successCount - alreadyModifiedCount;
  
  let summary = isAutoMode 
    ? `🤖 **AUTO MÓD** - Eredmény\n\n`
    : `👆 **MANUAL MÓD** - Eredmény\n\n`;
  
  // Fájl statisztikák (Cursor stílusban)
  const fileStats = new Map<string, { added: number; removed: number; alreadyModified: boolean }>();
  
  results.forEach((result, i) => {
    const patch = patches[i];
    const path = result.resolvedPath || patch.filePath;
    
    if (!fileStats.has(path)) {
      fileStats.set(path, { added: 0, removed: 0, alreadyModified: false });
    }
    
    const stats = fileStats.get(path)!;
    if (result.alreadyModified) {
      stats.alreadyModified = true;
    } else {
      stats.removed += result.originalLines;
      stats.added += result.modifiedLines;
    }
  });
  
  // Fájlok listázása statisztikákkal
  summary += `📁 **${fileStats.size} fájl**\n`;
  
  fileStats.forEach((stats, path) => {
    const fileName = path.split('/').pop() || path;
    const result = results.find(r => (r.resolvedPath || patches[results.indexOf(r)]?.filePath) === path);
    
    if (stats.alreadyModified) {
      summary += `✓ \`${fileName}\` már módosítva volt\n`;
    } else if (result?.success) {
      const diff = stats.added - stats.removed;
      const diffStr = diff >= 0 ? `+${stats.added}` : `${diff}`;
      summary += `✅ \`${fileName}\` ${diffStr} sor\n`;
    } else {
      summary += `❌ \`${fileName}\` sikertelen\n`;
    }
  });
  
  summary += `\n`;
  
  // Eredmény összefoglaló
  if (alreadyModifiedCount === results.length) {
    summary += `✓ **Minden fájl már korábban módosítva volt** - nincs teendő`;
  } else if (actuallyChangedCount > 0 && failedCount === 0) {
    summary += `✅ **${actuallyChangedCount}** módosítás alkalmazva`;
    if (alreadyModifiedCount > 0) {
      summary += ` (${alreadyModifiedCount} már kész volt)`;
    }
  } else if (successCount > 0) {
    summary += `⚠️ **${successCount}/${results.length}** sikeres, **${failedCount}** sikertelen`;
  } else {
    summary += `❌ **Minden módosítás sikertelen**`;
  }
  
  return summary;
}

/**
 * Részletes módosítás preview formázása
 */
export function formatPatchPreview(patch: SuggestedPatch, result?: PatchResult): string {
  const fileName = patch.filePath.split('/').pop() || patch.filePath;
  const originalLines = patch.original.split('\n').length;
  const modifiedLines = patch.modified.split('\n').length;
  const lineDiff = modifiedLines - originalLines;
  const diffStr = lineDiff >= 0 ? `+${lineDiff}` : `${lineDiff}`;
  
  let preview = `📄 **${fileName}** (${diffStr} sor)\n\n`;
  
  // Eredeti kód (rövidítve ha túl hosszú)
  const originalPreview = patch.original.length > 200 
    ? patch.original.substring(0, 200) + '...' 
    : patch.original;
  
  preview += `**Eredeti:**\n\`\`\`\n${originalPreview}\n\`\`\`\n\n`;
  
  // Módosított kód (rövidítve ha túl hosszú)
  const modifiedPreview = patch.modified.length > 200 
    ? patch.modified.substring(0, 200) + '...' 
    : patch.modified;
  
  preview += `**Módosított:**\n\`\`\`\n${modifiedPreview}\n\`\`\``;
  
  if (result) {
    preview += `\n\n`;
    if (result.success) {
      preview += `✅ Alkalmazva (${result.matchType})`;
    } else {
      preview += `❌ ${result.error}`;
    }
  }
  
  return preview;
}

