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
export type ChatRole = "user" | "assistant" | "system";

/**
 * Fájl módosítás részletek (diff adatokkal)
 */
export interface FileModification {
  path: string;
  action: "create" | "edit" | "write" | "delete";
  lines_added: number;
  lines_deleted: number;
  before_content?: string;
  after_content?: string;
  timestamp: string;
  messageId: number;  // Melyik chat üzenethez tartozik
}

/**
 * Chat üzenet
 */
export interface ChatMessage {
  id: number;
  role: ChatRole;
  text: string;
  modifications?: FileModification[];  // Csatolt fájl módosítások
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
 * Projekt kód (forrás + módosított + fájl útvonal)
 */
export interface ProjectCode {
  source: string;
  projected: string;
  filePath?: string;  // A fájl elérési útja - fontos a chat működéséhez!
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

/**
 * Jóváhagyásra váró művelet (terminal parancs, fájl törlés, fájl írás, stb.)
 */
export interface PendingPermission {
  tool_call_id: string;
  tool_name: string;
  permission_type: "terminal" | "delete" | "write" | "edit" | "create_directory";
  details: {
    command?: string;
    description?: string;
    working_directory?: string;
    timeout?: number;
    path?: string;
    full_path?: string;
    size?: number;
    content_length?: number;
    content_preview?: string;
    content?: string;
    old_text?: string;
    new_text?: string;
    old_preview?: string;
    new_preview?: string;
    file_hash?: string;  // Fájl frissesség ellenőrzéshez
  };
  arguments: Record<string, unknown>;
}