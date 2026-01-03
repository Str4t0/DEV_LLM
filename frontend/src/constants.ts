// frontend/src/constants.ts

/**
 * Panel alapértelmezett méretek (PixelBen és arányokban)
 */
export const PANEL_DEFAULTS = {
  PROJECTS_WIDTH: 260,
  OPTIONS_WIDTH: 260,
  SOURCE_WIDTH_RATIO: 0.5,
  TOP_HEIGHT_RATIO: 0.6, // Még használjuk a mobile nézethez
  PROJECTS_INNER_RATIO: 0.6,
  CHAT_LOG_RATIO: 0.75, // Chat és log közötti arány (chat 75%, log 25%)
  CODE_RIGHT_RATIO: 0.65, // Kód és jobb oldal közötti arány (kód 65%, jobb 35%)
} as const;

/**
 * Panel méret korlátok
 */
export const PANEL_LIMITS = {
  PROJECTS_MIN_WIDTH: 160,
  PROJECTS_MAX_WIDTH: 600,
  OPTIONS_MIN_WIDTH: 140,
  OPTIONS_MAX_WIDTH: 520,
  WIDTH_RATIO_MIN: 0.15,
  WIDTH_RATIO_MAX: 0.85,
  HEIGHT_RATIO_MIN: 0.25,
  HEIGHT_RATIO_MAX: 0.85,
} as const;

/**
 * Támogatott kódolások
 */
export const ENCODINGS = [
  { value: "utf-8", label: "UTF-8" },
  { value: "utf-8-sig", label: "UTF-8 BOM" },
  { value: "utf-16", label: "UTF-16" },
  { value: "utf-16-le", label: "UTF-16 LE" },
  { value: "utf-16-be", label: "UTF-16 BE" },
  { value: "cp1250", label: "Windows-1250 (Közép-Európai)" },
  { value: "cp1251", label: "Windows-1251 (Cirill)" },
  { value: "cp1252", label: "Windows-1252 (Nyugat-Európai)" },
  { value: "cp437", label: "CP437 (DOS)" },
  { value: "cp852", label: "CP852 (DOS Közép-Európai)" },
  { value: "iso-8859-1", label: "ISO-8859-1 (Latin-1)" },
  { value: "iso-8859-2", label: "ISO-8859-2 (Latin-2, Magyar)" },
  { value: "iso-8859-15", label: "ISO-8859-15 (Latin-9)" },
  { value: "ascii", label: "ASCII" },
  { value: "gb2312", label: "GB2312 (Kínai)" },
  { value: "gbk", label: "GBK (Kínai)" },
  { value: "big5", label: "Big5 (Trad. Kínai)" },
  { value: "shift_jis", label: "Shift_JIS (Japán)" },
  { value: "euc-jp", label: "EUC-JP (Japán)" },
  { value: "euc-kr", label: "EUC-KR (Koreai)" },
  { value: "koi8-r", label: "KOI8-R (Orosz)" },
] as const;

export type Encoding = (typeof ENCODINGS)[number]["value"];

/**
 * Kódolás címke lekérése érték alapján
 */
export function getEncodingLabel(enc: Encoding): string {
  return ENCODINGS.find((e) => e.value === enc)?.label ?? enc;
}