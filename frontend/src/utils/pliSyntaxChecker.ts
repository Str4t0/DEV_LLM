// frontend/src/utils/pliSyntaxChecker.ts

/**
 * PL/I syntax checker - alapvető szintaxis hibák detektálása
 */

export interface SyntaxError {
  line: number;
  column?: number;
  message: string;
  severity: "error" | "warning";
}

interface StackItem {
  type: "DO" | "PAREN" | "BRACKET";
  line: number;
  column: number;
}

/**
 * PL/I kód szintaxis ellenőrzése
 */
export function checkPLISyntax(code: string): SyntaxError[] {
  const errors: SyntaxError[] = [];
  const lines = code.split("\n");
  
  // Külön stack-ek: DO blokkokhoz és zárójelekhez
  const doStack: StackItem[] = [];
  const parenBracketStack: StackItem[] = [];
  
  // Komment kezdet és vége pozíciók
  let inComment = false;
  
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;
    
    // Komment kezelés
    let inLineComment = false;
    let processedLine = "";
    
    for (let i = 0; i < line.length; i++) {
      if (inComment) {
        if (line[i] === "*" && i + 1 < line.length && line[i + 1] === "/") {
          inComment = false;
          i++; // Skip the '/'
          processedLine += "  "; // Komment rész helyett space
        } else {
          processedLine += " "; // Komment karaktereket ignoráljuk
        }
      } else if (line[i] === "/" && i + 1 < line.length && line[i + 1] === "*") {
        inComment = true;
        processedLine += "  ";
        i++; // Skip the '*'
      } else {
        processedLine += line[i];
      }
    }
    
    // DO/END párosítás - csak ha van DO;, akkor kell END;
    // PL/I szabály: DO; csak akkor kötelező ha több utasítás van
    // Ha nincs DO;, akkor az END; lehet IF...THEN blokk zárása, ami nem hiba
    const doMatch = processedLine.match(/\bDO\s*;/gi);
    const endMatch = processedLine.match(/\bEND\s*;/gi);
    
    if (doMatch) {
      const matchIndex = processedLine.indexOf(doMatch[0]);
      doStack.push({
        type: "DO",
        line: lineNum,
        column: matchIndex + 1,
      });
    }
    
    if (endMatch) {
      // Ha van DO a stack-ben, zárjuk le
      // Ha nincs, akkor lehet IF...THEN blokk zárása, ami OK - NEM jelezünk hibát
      if (doStack.length > 0) {
        doStack.pop();
      }
      // Egyébként (END; DO nélkül) nem hiba - lehet IF...THEN blokk zárása
    }
    
    // Zárójelek ellenőrzése
    for (let i = 0; i < processedLine.length; i++) {
      const char = processedLine[i];
      
      if (char === "(") {
        parenBracketStack.push({
          type: "PAREN",
          line: lineNum,
          column: i + 1,
        });
      } else if (char === ")") {
        if (parenBracketStack.length === 0 || parenBracketStack[parenBracketStack.length - 1].type !== "PAREN") {
          errors.push({
            line: lineNum,
            column: i + 1,
            message: "Záró zárójel ')' kezdő zárójel nélkül",
            severity: "error",
          });
        } else {
          parenBracketStack.pop();
        }
      } else if (char === "[") {
        parenBracketStack.push({
          type: "BRACKET",
          line: lineNum,
          column: i + 1,
        });
      } else if (char === "]") {
        if (parenBracketStack.length === 0 || parenBracketStack[parenBracketStack.length - 1].type !== "BRACKET") {
          errors.push({
            line: lineNum,
            column: i + 1,
            message: "Záró szögletes zárójel ']' kezdő zárójel nélkül",
            severity: "error",
          });
        } else {
          parenBracketStack.pop();
        }
      }
    }
    
    // String literálok kezelése (egyszerűsített)
    // PL/I-ban a stringek '...' formában vannak
    let inString = false;
    for (let i = 0; i < processedLine.length; i++) {
      if (processedLine[i] === "'" && (i === 0 || processedLine[i - 1] !== "\\")) {
        inString = !inString;
      }
    }
    
    if (inString && lineIdx === lines.length - 1) {
      errors.push({
        line: lineNum,
        message: "Lezáratlan string literál (hiányzó ' zárójel)",
        severity: "error",
      });
    }
  }
  
  // Ellenőrizzük a maradék DO stack-et (nyitott DO blokkok)
  while (doStack.length > 0) {
    const item = doStack.pop()!;
    errors.push({
      line: item.line,
      column: item.column,
      message: `Nyitott DO blokk - hiányzó END;`,
      severity: "error",
    });
  }
  
  // Ellenőrizzük a maradék zárójeleket
  while (parenBracketStack.length > 0) {
    const item = parenBracketStack.pop()!;
    errors.push({
      line: item.line,
      column: item.column,
      message: `Nyitott ${item.type === "PAREN" ? "zárójel" : "szögletes zárójel"} - hiányzó záró elem`,
      severity: "error",
    });
  }
  
  return errors;
}

/**
 * Syntax hiba formázása megjelenítéshez
 */
export function formatSyntaxError(error: SyntaxError): string {
  let msg = `Sor ${error.line}`;
  if (error.column) {
    msg += `, oszlop ${error.column}`;
  }
  msg += `: ${error.message}`;
  return msg;
}
