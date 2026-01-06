// frontend/src/utils/fileUtils.ts

import type { FileNode } from "../types";

/**
 * Nyers path tisztítása (backslash, felesleges karakterek)
 */
export function sanitizeRawPath(raw: string): string {
  let p = raw.trim().replace(/\\/g, "/");
  
  // Rossz helyen lévő ']' eltávolítása
  p = p.replace(/\]\.([A-Za-z0-9]+)\]?$/g, ".$1");
  p = p.replace(/\]$/g, "");
  
  // Idézőjelek
  p = p.replace(/^["']|["']$/g, "");
  
  // Többszörös szóköz
  p = p.replace(/\s+/g, " ").trim();
  
  return p;
}

/**
 * Fájlnév normalizálása összehasonlításhoz
 */
export function normalizeFileName(name: string): string {
  let n = name.trim().toLowerCase();
  n = n.replace(/\.txt$/, "");
  n = n.replace(/\(\d+\)$/, ""); // pl. "file (1)" -> "file"
  n = n.replace(/\s+/g, "");
  return n;
}

/**
 * Fájl keresése a fa struktúrában név vagy prefix alapján
 */
export function findPathInTreeByName(
  files: FileNode[],
  nameOrPrefix: string
): string | null {
  const targetNorm = normalizeFileName(nameOrPrefix);

  // 1. Pontos egyezés (case-sensitive)
  let stack: FileNode[] = [...files];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n.is_dir && n.name === nameOrPrefix) return n.path;
    if (n.children) stack.push(...n.children);
  }

  // 2. Pontos egyezés (case-insensitive)
  stack = [...files];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n.is_dir && n.name.toLowerCase() === nameOrPrefix.toLowerCase())
      return n.path;
    if (n.children) stack.push(...n.children);
  }

  // 3. Normalizált egyezés
  stack = [...files];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n.is_dir && normalizeFileName(n.name) === targetNorm) 
      return n.path;
    if (n.children) stack.push(...n.children);
  }

  // 4. Prefix keresés
  stack = [...files];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n.is_dir && 
        n.name.toLowerCase().startsWith(nameOrPrefix.toLowerCase()))
      return n.path;
    if (n.children) stack.push(...n.children);
  }

  // 5. Substring keresés
  stack = [...files];
  while (stack.length) {
    const n = stack.pop()!;
    if (!n.is_dir && 
        n.name.toLowerCase().includes(nameOrPrefix.toLowerCase()))
      return n.path;
    if (n.children) stack.push(...n.children);
  }

  return null;
}

/**
 * Ellenőrzi, hogy egy adott útvonal létezik-e a fájlfában
 */
export function validatePathInTree(
  path: string,
  filesTree: FileNode[] | null
): boolean {
  if (!filesTree || !path) return false;
  
  const normalizedPath = path.replace(/\\/g, "/").toLowerCase();
  
  const stack: FileNode[] = [...filesTree];
  while (stack.length) {
    const node = stack.pop()!;
    if (!node.is_dir && node.path.toLowerCase() === normalizedPath) {
      return true;
    }
    if (node.children) stack.push(...node.children);
  }
  return false;
}

/**
 * Fájl útvonal feloldása a fájlfából
 * Először próbálja pontosan, majd fuzzy kereséssel
 */
export function resolvePathFromTree(
  rawPath: string,
  filesTree: FileNode[] | null
): string | null {
  if (!filesTree || !rawPath) return null;
  
  const filePath = sanitizeRawPath(rawPath);
  const normalizedPath = filePath.toLowerCase();
  
  // 1. Pontos egyezés (case-insensitive)
  const stack: FileNode[] = [...filesTree];
  while (stack.length) {
    const node = stack.pop()!;
    if (!node.is_dir && node.path.toLowerCase() === normalizedPath) {
      return node.path;
    }
    if (node.children) stack.push(...node.children);
  }
  
  // 2. Ha csak fájlnév volt megadva, keresés név alapján
  if (!filePath.includes("/")) {
    return findPathInTreeByName(filesTree, filePath);
  }
  
  // 3. Partial path match - ha a path végződése egyezik
  const pathParts = normalizedPath.split("/");
  const searchStack: FileNode[] = [...filesTree];
  while (searchStack.length) {
    const node = searchStack.pop()!;
    if (!node.is_dir) {
      const nodeParts = node.path.toLowerCase().split("/");
      // Check if the end of the node path matches
      if (nodeParts.length >= pathParts.length) {
        const nodeEnd = nodeParts.slice(-pathParts.length).join("/");
        if (nodeEnd === normalizedPath) {
          return node.path;
        }
      }
    }
    if (node.children) searchStack.push(...node.children);
  }
  
  return null;
}

/**
 * Nyers path feloldása chat-ből érkező fájl linkhez
 */
export function resolveRelPathFromChat(
  rawPath: string,
  filesTree: FileNode[] | null
): string | null {
  let filePath = sanitizeRawPath(rawPath);

  // Ha nincs filesTree, adjuk vissza ahogy van
  if (!filesTree) return filePath;

  // Próbáljuk feloldani a fájlfából
  const resolved = resolvePathFromTree(filePath, filesTree);
  
  // Ha találtunk, adjuk vissza
  if (resolved) return resolved;
  
  // Ha nem találtunk és nincs könyvtár benne, még egy próba név alapján
  if (!filePath.includes("/")) {
    return findPathInTreeByName(filesTree, filePath);
  }
  
  // Nem találtuk - visszaadjuk az eredetit (backend ellenőrzi majd)
  return filePath;
}

/**
 * Fájl referencia normalizálása és validálása
 */
export function sanitizeFileRef(
  fileRef: string, 
  allFiles: string[]
): string | null {
  // Trimmelés, láthatatlan karakterek eltávolítása
  let f = (fileRef || "")
    .trim()
    .replace(/\u200b|\u200e|\u200f/g, "");
  
  // Tipikus elütés javítása: "(1].txt" -> "(1).txt"
  f = f.replace(/\((\d+)]\.txt$/i, "($1).txt");
  
  // Pontos egyezés ellenőrzése
  if (allFiles.includes(f)) return f;
  
  // Case-insensitive egyezés
  const hit = allFiles.find(
    x => x.toLowerCase() === f.toLowerCase()
  );
  
  return hit || null;
}