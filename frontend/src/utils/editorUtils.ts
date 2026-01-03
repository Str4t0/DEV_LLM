// frontend/src/utils/editorUtils.ts

import type { EditorSettings } from "../types";

export const defaultEditorSettings: EditorSettings = {
  maxLines: null,
  maxColumns: null,
  mode: "truncate",
};

/**
 * Kódformázás a beállítások alapján
 */
export function applyEditorSettings(
  text: string, 
  settings: EditorSettings
): string {
  let lines = text.split("\n");
  const { maxLines, maxColumns, mode } = settings;

  // Max oszlop – truncate vagy wrap
  if (maxColumns != null && maxColumns > 0) {
    const newLines: string[] = [];

    for (const line of lines) {
      const lineLen = line.length;

      if (mode === "truncate") {
        // Levágjuk a sort, ha hosszabb
        newLines.push(lineLen > maxColumns ? line.slice(0, maxColumns) : line);
      } else {
        // wrap mód: daraboljuk maxColumns hosszú blokkokra
        if (lineLen === 0) {
          newLines.push("");
        } else {
          for (let i = 0; i < lineLen; i += maxColumns) {
            newLines.push(line.slice(i, i + maxColumns));
          }
        }
      }
    }

    lines = newLines;
  }

  // Max sor – a feldolgozott sorokra alkalmazzuk
  if (maxLines != null && maxLines > 0 && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
  }

  return lines.join("\n");
}