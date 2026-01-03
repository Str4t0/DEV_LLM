# -*- coding: utf-8 -*-
"""
Code Change Parser - Biztonságos kódmódosítás kezelés

Feladata:
1. LLM válaszból [CODE_CHANGE] blokkok kinyerése
2. Validálás és biztonságos feldolgozás
3. Struktúrált változtatások visszaadása
"""

import re
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class CodeChange:
    """Egy kódmódosítás reprezentációja"""
    file_path: str
    action: str  # 'replace', 'insert_after', 'insert_before', 'delete'
    original_code: Optional[str]  # A cserélendő kód (replace esetén)
    new_code: Optional[str]  # Az új kód
    anchor_code: Optional[str]  # Horgony kód (insert esetén)
    explanation: str
    is_valid: bool = True
    validation_error: Optional[str] = None


def parse_code_changes(llm_response: str) -> List[CodeChange]:
    """
    Parse [CODE_CHANGE] blocks from LLM response.
    
    Returns list of CodeChange objects.
    """
    changes = []
    
    # [CODE_CHANGE] ... [/CODE_CHANGE] blokkok keresése
    pattern = r'\[CODE_CHANGE\](.*?)\[/CODE_CHANGE\]'
    matches = re.findall(pattern, llm_response, re.DOTALL | re.IGNORECASE)
    
    for match in matches:
        change = parse_single_change(match)
        changes.append(change)
    
    # Fallback: régi [JAVASOLT_MÓDOSÍTÁS] formátum kezelése
    old_pattern = r'\[JAVASOLT_MÓDOSÍTÁS\](.*?)\[/JAVASOLT_MÓDOSÍTÁS\]'
    old_matches = re.findall(old_pattern, llm_response, re.DOTALL | re.IGNORECASE)
    
    for match in old_matches:
        change = parse_old_format(match)
        if change:
            changes.append(change)
    
    return changes


def parse_single_change(block: str) -> CodeChange:
    """Parse a single CODE_CHANGE block"""
    
    # FILE: path
    file_match = re.search(r'FILE:\s*(.+?)(?:\n|$)', block)
    file_path = file_match.group(1).strip() if file_match else "unknown"
    
    # ACTION: replace/insert_after/etc
    action_match = re.search(r'ACTION:\s*(\w+)', block, re.IGNORECASE)
    action = action_match.group(1).lower() if action_match else "replace"
    
    # ORIGINAL: ```...``` or ORIGINAL:\n```...```
    original_code = extract_code_block(block, 'ORIGINAL')
    
    # MODIFIED: ```...``` or NEW_CODE: ```...```
    new_code = extract_code_block(block, 'MODIFIED') or extract_code_block(block, 'NEW_CODE')
    
    # ANCHOR: ```...```
    anchor_code = extract_code_block(block, 'ANCHOR')
    
    # EXPLANATION: 
    explanation_match = re.search(r'EXPLANATION:\s*(.+?)(?:\[|$)', block, re.DOTALL)
    explanation = explanation_match.group(1).strip() if explanation_match else ""
    
    # Validáció
    is_valid = True
    validation_error = None
    
    if action == "replace":
        if not original_code:
            is_valid = False
            validation_error = "Hiányzó ORIGINAL kód a replace művelethez"
        if not new_code:
            is_valid = False
            validation_error = "Hiányzó MODIFIED kód a replace művelethez"
    elif action in ("insert_after", "insert_before"):
        if not anchor_code:
            is_valid = False
            validation_error = f"Hiányzó ANCHOR kód az {action} művelethez"
        if not new_code:
            is_valid = False
            validation_error = "Hiányzó NEW_CODE"
    
    return CodeChange(
        file_path=file_path,
        action=action,
        original_code=original_code,
        new_code=new_code,
        anchor_code=anchor_code,
        explanation=explanation,
        is_valid=is_valid,
        validation_error=validation_error
    )


def parse_old_format(block: str) -> Optional[CodeChange]:
    """Parse old [JAVASOLT_MÓDOSÍTÁS] format for backwards compatibility"""
    
    # FILE: path
    file_match = re.search(r'FILE:\s*(.+?)(?:\n|$)', block)
    file_path = file_match.group(1).strip() if file_match else "unknown"
    
    # EREDETI: ```...```
    original_code = extract_code_block(block, 'EREDETI')
    
    # MÓDOSÍTOTT: ```...```
    new_code = extract_code_block(block, 'MÓDOSÍTOTT')
    
    if not original_code or not new_code:
        return None
    
    return CodeChange(
        file_path=file_path,
        action="replace",
        original_code=original_code,
        new_code=new_code,
        anchor_code=None,
        explanation="Régi formátumból konvertálva",
        is_valid=True
    )


def extract_code_block(text: str, label: str) -> Optional[str]:
    """
    Extract code block after a label.
    
    Handles formats:
    - LABEL:\n```\ncode\n```
    - LABEL:\n```lang\ncode\n```
    - LABEL: ```code```
    """
    # Pattern: LABEL: ... ``` ... ```
    patterns = [
        # LABEL:\n```\ncode\n```
        rf'{label}:\s*```[^\n]*\n(.*?)```',
        # LABEL:\n code (nincs backtick)
        rf'{label}:\s*\n([^\[]+?)(?=\n[A-Z_]+:|$)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
        if match:
            code = match.group(1)
            # Clean up
            code = code.strip()
            if code:
                return code
    
    return None


def validate_code_change(change: CodeChange, current_code: str) -> Dict:
    """
    Validate that a code change can be safely applied.
    
    Returns:
    {
        "can_apply": bool,
        "error": str or None,
        "match_count": int,  # Hány helyen található az original
        "preview": str  # Előnézet a változásról
    }
    """
    result = {
        "can_apply": False,
        "error": None,
        "match_count": 0,
        "preview": ""
    }
    
    if not change.is_valid:
        result["error"] = change.validation_error
        return result
    
    if change.action == "replace":
        if not change.original_code:
            result["error"] = "Nincs megadva eredeti kód"
            return result
        
        # Keressük az eredeti kódot
        # Normalizáljuk a whitespace-t az összehasonlításhoz
        original_normalized = normalize_code_for_matching(change.original_code)
        current_normalized = normalize_code_for_matching(current_code)
        
        # Pontos egyezés keresése
        if change.original_code in current_code:
            result["match_count"] = current_code.count(change.original_code)
            if result["match_count"] == 1:
                result["can_apply"] = True
                result["preview"] = f"Pontosan 1 egyezés - biztonságos csere"
            else:
                result["error"] = f"Többszörös egyezés ({result['match_count']}x) - nem egyértelmű"
        elif original_normalized in current_normalized:
            result["can_apply"] = True
            result["match_count"] = 1
            result["preview"] = "Normalizált egyezés - whitespace eltérés"
        else:
            result["error"] = "Az eredeti kód nem található a fájlban"
            # Próbáljunk segíteni - első 50 karakter keresése
            snippet = change.original_code[:50]
            if snippet in current_code:
                result["error"] += f" (de a kezdete megvan)"
    
    elif change.action in ("insert_after", "insert_before"):
        if not change.anchor_code:
            result["error"] = "Nincs megadva horgony kód"
            return result
        
        if change.anchor_code in current_code:
            result["can_apply"] = True
            result["match_count"] = current_code.count(change.anchor_code)
            if result["match_count"] > 1:
                result["error"] = f"Többszörös horgony ({result['match_count']}x)"
                result["can_apply"] = False
            else:
                result["preview"] = f"Beszúrás {change.action.replace('_', ' ')}"
        else:
            result["error"] = "A horgony kód nem található"
    
    return result


def apply_code_change(change: CodeChange, current_code: str) -> Optional[str]:
    """
    Apply a validated code change to the current code.
    
    Returns the new code or None if failed.
    """
    if not change.is_valid:
        return None
    
    if change.action == "replace":
        if change.original_code and change.original_code in current_code:
            return current_code.replace(change.original_code, change.new_code or "", 1)
        else:
            # Próbáljunk normalizált cserét
            original_norm = normalize_code_for_matching(change.original_code or "")
            lines = current_code.split('\n')
            new_lines = []
            replaced = False
            
            for line in lines:
                if not replaced and normalize_code_for_matching(line) in original_norm:
                    # Itt kezdődik az egyezés
                    # Ez egy egyszerűsített megközelítés
                    pass
                new_lines.append(line)
            
            # Fallback: ne csinálj semmit ha nem sikerült
            return None
    
    elif change.action == "insert_after":
        if change.anchor_code and change.anchor_code in current_code:
            return current_code.replace(
                change.anchor_code,
                change.anchor_code + "\n" + (change.new_code or ""),
                1
            )
    
    elif change.action == "insert_before":
        if change.anchor_code and change.anchor_code in current_code:
            return current_code.replace(
                change.anchor_code,
                (change.new_code or "") + "\n" + change.anchor_code,
                1
            )
    
    elif change.action == "delete":
        if change.original_code and change.original_code in current_code:
            return current_code.replace(change.original_code, "", 1)
    
    return None


def normalize_code_for_matching(code: str) -> str:
    """Normalize code for fuzzy matching"""
    if not code:
        return ""
    # Távolítsuk el a felesleges whitespace-t
    lines = code.strip().split('\n')
    normalized_lines = [line.strip() for line in lines]
    return '\n'.join(normalized_lines)


def extract_simple_code_blocks(llm_response: str) -> List[Dict]:
    """
    Extract simple code blocks from LLM response.
    
    This is a fallback for responses without [CODE_CHANGE] format.
    Returns list of dicts with 'language' and 'code' keys.
    """
    blocks = []
    
    # ```lang\ncode\n``` pattern
    pattern = r'```(\w*)\n(.*?)```'
    matches = re.findall(pattern, llm_response, re.DOTALL)
    
    for lang, code in matches:
        blocks.append({
            "language": lang or "plaintext",
            "code": code.strip()
        })
    
    return blocks


def format_code_changes_for_response(changes: List[CodeChange]) -> List[Dict]:
    """Format code changes for API response"""
    return [
        {
            "file_path": c.file_path,
            "action": c.action,
            "original_code": c.original_code,
            "new_code": c.new_code,
            "anchor_code": c.anchor_code,
            "explanation": c.explanation,
            "is_valid": c.is_valid,
            "validation_error": c.validation_error
        }
        for c in changes
    ]


