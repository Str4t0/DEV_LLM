// frontend/src/utils/pliSyntaxHighlighter.ts

/**
 * PL/I syntax highlighter - kulcsszavak és szintaxis elemek színezése
 */

// PL/I kulcsszavak
const PLI_KEYWORDS = [
  // Vezérlési struktúrák
  'PROC', 'PROCEDURE', 'END', 'RETURN', 'CALL', 'GOTO', 'GO TO',
  'IF', 'THEN', 'ELSE', 'DO', 'WHILE', 'UNTIL', 'ITERATE', 'LEAVE',
  'SELECT', 'WHEN', 'OTHERWISE',
  
  // Deklarációk
  'DCL', 'DECLARE', 'INIT', 'INITIAL', 'STATIC', 'AUTOMATIC', 'CONTROLLED',
  'BASED', 'DEFINED', 'REFER', 'LIKE',
  
  // Adattípusok
  'FIXED', 'BINARY', 'DECIMAL', 'FLOAT', 'REAL', 'COMPLEX',
  'CHARACTER', 'CHAR', 'VARYING', 'VAR', 'BIT', 'PICTURE', 'PIC',
  'PTR', 'POINTER', 'OFFSET', 'AREA', 'RECORD', 'FILE', 'ENTRY',
  'LABEL', 'FORMAT', 'CONDITION', 'EVENT',
  
  // Attribútumok
  'PRECISION', 'SCALE', 'LENGTH', 'DIMENSION', 'DIM', 'EXTENT',
  'ALIGNED', 'UNALIGNED', 'PACKED', 'UNPACKED',
  'EXTERNAL', 'INTERNAL', 'BUILTIN', 'OPTIONS',
  
  // I/O műveletek
  'GET', 'PUT', 'READ', 'WRITE', 'OPEN', 'CLOSE', 'DELETE', 'REWRITE',
  'DISPLAY', 'SKIP', 'PAGE', 'LINE', 'COLUMN', 'COL',
  
  // Fájlkezelés
  'ENV', 'ENVIRONMENT', 'TITLE', 'KEYED', 'SEQUENTIAL', 'DIRECT',
  'STREAM', 'RECORD', 'PRINT', 'INPUT', 'OUTPUT', 'UPDATE',
  
  // Hibakezelés
  'SIGNAL', 'ON', 'REVERT', 'ERROR', 'UNDERFLOW', 'OVERFLOW',
  'ZERODIVIDE', 'CONVERSION', 'SIZE', 'STRINGRANGE', 'SUBSCRIPTRANGE',
  
  // Built-in függvények (fontosabbak)
  'ABS', 'MAX', 'MIN', 'MOD', 'SIGN', 'SQRT', 'LOG', 'LOG10', 'EXP',
  'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN', 'ATAN2',
  'SUBSTR', 'INDEX', 'LENGTH', 'TRIM', 'UPPER', 'LOWER',
  'STRING', 'UNSTRING', 'TRANSLATE', 'REVERSE', 'REPEAT',
  'DATE', 'TIME', 'DATETIME', 'TODAY',
  
  // Operátorok és logika
  'AND', 'OR', 'NOT', 'XOR',
  
  // Egyéb
  'ALLOCATE', 'FREE', 'ADDR', 'ADDRESS', 'NULL', 'SYSNULL',
  'RECURSIVE', 'OPTIONS', 'MAIN', 'REENTRANT',
];

// PL/I preprocessor direktívák
const PLI_PREPROCESSOR = [
  '%INCLUDE', '%REPLACE', '%ACTIVATE', '%DEACTIVATE',
  '%IF', '%THEN', '%ELSE', '%ENDIF', '%DO', '%END',
];

// PL/I beépített konstansok
const PLI_CONSTANTS = [
  'SYSIN', 'SYSPRINT', 'SYSLIST', 'SYSPUNCH',
  'ONCODE', 'ONCHAR', 'ONKEY', 'ONLOC',
];

/**
 * Színezett token típusok
 */
export interface HighlightToken {
  text: string;
  type: 'keyword' | 'string' | 'comment' | 'number' | 'operator' | 'preprocessor' | 'constant' | 'normal';
}

/**
 * PL/I kód színezése
 */
export function highlightPLI(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const lines = code.split('\n');
  
  // Normalizált kulcsszavak (nagybetűsítve)
  const keywordsSet = new Set(PLI_KEYWORDS.map(k => k.toUpperCase()));
  const preprocessorSet = new Set(PLI_PREPROCESSOR.map(k => k.toUpperCase()));
  const constantsSet = new Set(PLI_CONSTANTS.map(k => k.toUpperCase()));
  
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let i = 0;
    let inComment = false;
    let inString = false;
    let stringChar = '';
    let currentToken = '';
    let tokenStart = 0;
    
    while (i < line.length) {
      const char = line[i];
      const nextChar = i + 1 < line.length ? line[i + 1] : '';
      
      // Komment kezelés /* ... */
      if (!inString && char === '/' && nextChar === '*') {
        if (currentToken) {
          tokens.push(createToken(currentToken, tokenStart, lineIdx, keywordsSet, preprocessorSet, constantsSet));
          currentToken = '';
        }
        inComment = true;
        i += 2;
        let commentText = '/*';
        while (i < line.length) {
          if (line[i] === '*' && i + 1 < line.length && line[i + 1] === '/') {
            commentText += '*/';
            tokens.push({ text: commentText, type: 'comment' });
            inComment = false;
            i += 2;
            break;
          }
          commentText += line[i];
          i++;
        }
        if (inComment) {
          tokens.push({ text: commentText, type: 'comment' });
        }
        continue;
      }
      
      if (inComment) {
        // Komment karaktereket már kezeltük fent
        i++;
        continue;
      }
      
      // String literálok kezelése '...' vagy "..."
      if (!inString && (char === "'" || char === '"')) {
        if (currentToken) {
          tokens.push(createToken(currentToken, tokenStart, lineIdx, keywordsSet, preprocessorSet, constantsSet));
          currentToken = '';
        }
        inString = true;
        stringChar = char;
        let stringText = char;
        i++;
        while (i < line.length) {
          if (line[i] === stringChar && (i === 0 || line[i - 1] !== '\\')) {
            stringText += stringChar;
            tokens.push({ text: stringText, type: 'string' });
            inString = false;
            i++;
            break;
          }
          stringText += line[i];
          i++;
        }
        if (inString) {
          tokens.push({ text: stringText, type: 'string' });
        }
        continue;
      }
      
      if (inString) {
        // String karaktereket már kezeltük fent
        i++;
        continue;
      }
      
      // Szó határok (whitespace, operátorok)
      if (/\s/.test(char) || /[()[\]{};:,.=<>!+\-*/&|]/.test(char)) {
        if (currentToken) {
          tokens.push(createToken(currentToken, tokenStart, lineIdx, keywordsSet, preprocessorSet, constantsSet));
          currentToken = '';
        }
        
        // Operátorok
        if (/[=<>!+\-*/&|]/.test(char)) {
          let operator = char;
          // Két karakteres operátorok: <=, >=, ==, <>, ||, &&, stb.
          if (i + 1 < line.length) {
            const twoChar = char + nextChar;
            if (['<=', '>=', '==', '<>', '||', '&&', '->', '<-'].includes(twoChar)) {
              operator = twoChar;
              i++;
            }
          }
          tokens.push({ text: operator, type: 'operator' });
        } else if (char !== ' ' && char !== '\t') {
          // Egyéb karakterek (zárójelek, stb.)
          tokens.push({ text: char, type: 'normal' });
        } else {
          // Whitespace
          tokens.push({ text: char, type: 'normal' });
        }
        i++;
        continue;
      }
      
      // Szó karakter
      if (!currentToken) {
        tokenStart = i;
      }
      currentToken += char;
      i++;
    }
    
    // Maradék token
    if (currentToken) {
      tokens.push(createToken(currentToken, tokenStart, lineIdx, keywordsSet, preprocessorSet, constantsSet));
    }
    
    // Újsor (kivéve az utolsó sor)
    if (lineIdx < lines.length - 1) {
      tokens.push({ text: '\n', type: 'normal' });
    }
  }
  
  return tokens;
}

/**
 * Token létrehozása típus meghatározással
 */
function createToken(
  text: string,
  start: number,
  lineIdx: number,
  keywordsSet: Set<string>,
  preprocessorSet: Set<string>,
  constantsSet: Set<string>
): HighlightToken {
  const upper = text.toUpperCase();
  
  // Szám ellenőrzés
  if (/^[\d.]+[XU]?$/.test(text) || /^['"][0-9A-F_]+[XN]?[XU]?$/i.test(text)) {
    return { text, type: 'number' };
  }
  
  // Preprocessor direktíva
  if (preprocessorSet.has(upper)) {
    return { text, type: 'preprocessor' };
  }
  
  // Kulcsszó
  if (keywordsSet.has(upper)) {
    return { text, type: 'keyword' };
  }
  
  // Konstans
  if (constantsSet.has(upper)) {
    return { text, type: 'constant' };
  }
  
  return { text, type: 'normal' };
}
