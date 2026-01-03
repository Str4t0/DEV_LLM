// frontend/src/types/index.ts

/**
 * Backend projekt típus
 */
export interface Project {
  id: number;
  name: string;
  description: string | null;
  root_path: string | null;
  created_at: string;
}

/**
 * Backend fájlfa típus
 */
export interface FileNode {
  name: string;
  path: string; // projekt root-hoz képest, pl. "src/App.tsx"
  is_dir: boolean;
  children?: FileNode[];
}

/**
 * Chat üzenet szerepek
 */
export type ChatRole = "user" | "assistant";

/**
 * Chat üzenet
 */
export interface ChatMessage {
  id: number;
  role: ChatRole;
  text: string;
}

/**
 * Kód snapshot az undo/redo-hoz
 */
export interface CodeSnapshot {
  source: string;
  projected: string;
  filePath?: string;
}

/**
 * Szerkesztő beállítások
 */
export type WrapMode = "truncate" | "wrap";

export interface EditorSettings {
  maxLines: number | null;
  maxColumns: number | null;
  mode: WrapMode;
}

export interface ProjectEditorSettings {
  source: EditorSettings;
  projected: EditorSettings;
}

/**
 * Projekt kód (forrás + módosított)
 */
export interface ProjectCode {
  source: string;
  projected: string;
}

/**
 * Javasolt patch az LLM-től
 */
export interface SuggestedPatch {
  id: string;
  filePath: string;
  original: string;
  modified: string;
  codeType?: "pli" | "sas" | "txt";
  lineNumbers?: {
    start: number;
    end: number;
  };
}

/**
 * Kód módosítási javaslat az új egyesített nézethez
 */
export interface CodeSuggestion {
  id: string;
  filePath: string;
  fullCode: string;        // A teljes eredeti kód (kontextushoz)
  originalSnippet: string; // A módosítandó rész az eredeti kódból
  suggestedSnippet: string; // A javasolt új kód
  description?: string;
  applied: boolean;
  // Több találat kezelése
  matchPositions: number[]; // Összes megtalált pozíció (sorszámok)
  selectedPosition: number; // Melyik pozíciót választottuk (index a matchPositions-ben)
}

/**
 * Drag state típusok
 */
export type DragState =
  | { type: "projects"; startX: number; startWidth: number }
  | { type: "options"; startX: number; startWidth: number }
  | { type: "source"; startX: number; startRatio: number }
  | { type: "top"; startY: number; startRatio: number }
  | { type: "projects-inner"; startY: number; startRatio: number }
  | { type: "chat-log"; startY: number; startRatio: number }
  | { type: "code-right"; startX: number; startRatio: number };

/**
 * Alkalmazás státusz
 */
export type Status = "online" | "offline" | "connecting";

/**
 * Diff sor típus
 */
export type DiffKind = "common" | "added" | "removed";

export interface DiffLine {
  type: DiffKind;
  text: string;
}