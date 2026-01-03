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
 * Nyers path feloldása chat-ből érkező fájl linkhez
 */
export function resolveRelPathFromChat(
  rawPath: string,
  filesTree: FileNode[] | null
): string | null {
  let filePath = sanitizeRawPath(rawPath);

  // Ha már mappát is tartalmaz, hagyjuk
  if (filePath.includes("/")) return filePath;

  // Csak fájlnév érkezett → keresés a file tree-ben
  if (!filesTree) return filePath;

  const found = findPathInTreeByName(filesTree, filePath);
  return found;
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